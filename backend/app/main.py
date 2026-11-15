import os
from contextlib import asynccontextmanager

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.v1.router import api_router
from app.api.v1.public_leads import router as public_leads_router
from app.api.v1.webhooks import router as webhooks_router
from app.auth.permissions import require_authenticated
from app.core.config import settings
from app.core.logging import configure_logging
from app.db.session import engine
from app.scheduler import scheduler

configure_logging()

# main.py lives at <backend>/app/main.py → the alembic.ini is one dir up.
_ALEMBIC_INI = os.path.join(os.path.dirname(os.path.dirname(__file__)), "alembic.ini")


def _alembic_head() -> str | None:
    try:
        return ScriptDirectory.from_config(Config(_ALEMBIC_INI)).get_current_head()
    except Exception:  # pragma: no cover - only if alembic config is unreadable
        return None


_ALEMBIC_HEAD = _alembic_head()


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Start the background scheduler with the app, stop it on shutdown.

    Tests construct TestClient without entering it as a context manager, so
    lifespan never runs there; the flag gate is belt-and-suspenders (conftest
    also sets scheduler_enabled=False)."""
    if settings.scheduler_enabled and settings.app_env != 'test':
        scheduler.start()
    yield
    scheduler.stop()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(
    api_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_authenticated)],
)

# Mounted separately and WITHOUT require_authenticated: Twilio posts here with
# no Clerk JWT. Authenticity is the X-Twilio-Signature HMAC, checked inside the
# handler before anything touches the database.
app.include_router(
    webhooks_router,
    prefix=f'{settings.api_v1_prefix}/webhooks',
)

# Also outside require_authenticated: the marketing site's server route posts
# demo requests here with a shared secret (X-Intake-Secret), no Clerk JWT.
app.include_router(
    public_leads_router,
    prefix=f'{settings.api_v1_prefix}/public',
)


@app.get("/health")
def health() -> dict[str, str]:
    """Shallow liveness — the process is up. Does NOT touch the DB."""
    return {"status": "ok", "environment": settings.app_env}


@app.get("/health/ready")
def health_ready():
    """Readiness: the DB is reachable AND migrations are at head.

    A shallow /health 200 does NOT prove the schema migrated — during the
    2026-06-03 deploy, RDS was down so migrations never ran, yet the app
    served 200. The deploy script polls THIS endpoint, so a deploy can't be
    declared healthy until the migration the new code expects is actually
    applied. Returns 503 (not ready) on DB error or a pending migration.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            current = MigrationContext.configure(conn).get_current_revision()
    except Exception as exc:
        return JSONResponse(status_code=503, content={"status": "db_unavailable", "detail": str(exc)[:200]})

    if _ALEMBIC_HEAD is None:
        return JSONResponse(status_code=503, content={"status": "alembic_unreadable"})
    if current != _ALEMBIC_HEAD:
        return JSONResponse(
            status_code=503,
            content={"status": "migration_pending", "current": current, "head": _ALEMBIC_HEAD},
        )
    return {"status": "ready", "db": "ok", "migration": "at_head", "revision": current}
