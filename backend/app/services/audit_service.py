from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.repositories.audit_repository import AuditRepository


class AuditService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = AuditRepository(db)

    def log(
        self,
        action: str,
        entity_type: str,
        entity_id: UUID | None = None,
        actor_user_id: UUID | None = None,
        organization_id: UUID | None = None,
        payload: dict | None = None,
    ) -> AuditLog:
        audit_log = AuditLog(
            id=uuid4(),
            actor_user_id=actor_user_id,
            organization_id=organization_id,
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            payload=payload or {},
        )
        return self.repository.create(audit_log)
