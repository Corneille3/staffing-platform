"""Writes the tier-0 operator audit trail (PLATFORM_HANDOFF §4). Does not commit;
the caller's transaction owns the commit."""
from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from app.models.platform_audit_log import PlatformAuditLog


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
