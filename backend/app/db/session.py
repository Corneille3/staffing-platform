from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session

from app.core.config import settings

engine = create_engine(settings.database_url, future=True)


@event.listens_for(engine, "connect")
def _register_uuid_adapter(dbapi_connection, _connection_record):
    from psycopg.types.uuid import register_default_adapters
    register_default_adapters(dbapi_connection)


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, class_=Session)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
