"""The tier-0 operator audit trail (PLATFORM_HANDOFF §4). `log` does not
commit — the caller's transaction owns the commit. `list_rows` is its reader."""
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.platform_audit_log import PlatformAuditLog
from app.models.tenant import Tenant
from app.models.user import User

# The part of an action before the dot ("tenant.suspended" -> "tenant").
AUDIT_CATEGORIES = ('tenant', 'operator', 'access', 'settings', 'lead', 'housekeeping')


def _as_uuid(value) -> UUID | None:
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


class PlatformAuditService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def log(
        self,
        actor_user_id: UUID | None,
        action: str,
        target_type: str | None = None,
        target_id: str | None = None,
        payload: dict | None = None,
    ) -> None:
        self.db.add(PlatformAuditLog(
            id=uuid4(),
            actor_user_id=actor_user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            payload=payload,
        ))

    # ── reader ────────────────────────────────────────────────────────────────

    def list_rows(self, category: str | None, limit: int, offset: int) -> tuple[list[dict], int]:
        """Newest first. Returns display-ready rows and the total for the
        filter. Names are resolved here so the screen needs no second call:
        the actor, and the network behind a tenant or an access grant."""
        where = []
        if category:
            where.append(PlatformAuditLog.action.like(f'{category}.%'))
        total = self.db.scalar(select(func.count()).select_from(PlatformAuditLog).where(*where)) or 0
        entries = list(self.db.scalars(
            select(PlatformAuditLog)
            .where(*where)
            .order_by(PlatformAuditLog.created_at.desc(), PlatformAuditLog.id.desc())
            .limit(limit).offset(offset)
        ))

        actor_ids = {entry.actor_user_id for entry in entries if entry.actor_user_id}
        actors = {
            user.id: user
            for user in self.db.scalars(select(User).where(User.id.in_(actor_ids)))
        } if actor_ids else {}

        tenant_ids = {tid for entry in entries if (tid := self._tenant_id(entry))}
        tenant_names = dict(self.db.execute(
            select(Tenant.id, Tenant.name).where(Tenant.id.in_(tenant_ids))
        ).all()) if tenant_ids else {}

        rows = []
        for entry in entries:
            payload = entry.payload or {}
            actor = actors.get(entry.actor_user_id)
            label = (
                tenant_names.get(self._tenant_id(entry))
                or payload.get('name') or payload.get('org_name')
                or payload.get('email') or payload.get('slug')
            )
            rows.append({
                'id': entry.id,
                'created_at': entry.created_at,
                'action': entry.action,
                'actor_name': f'{actor.first_name} {actor.last_name}'.strip() if actor else None,
                'actor_email': actor.email if actor else None,
                'target_type': entry.target_type,
                'target_id': entry.target_id,
                'target_label': label,
                'details': payload,
            })
        return rows, total

    @staticmethod
    def _tenant_id(entry: PlatformAuditLog) -> UUID | None:
        if entry.target_type == 'tenant':
            return _as_uuid(entry.target_id)
        return _as_uuid((entry.payload or {}).get('tenant_id'))
