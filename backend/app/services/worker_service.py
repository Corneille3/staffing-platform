from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.models.enums import AvailabilityStatus
from app.models.worker_profile import WorkerProfile
from app.models.user import User
from app.repositories.worker_repository import WorkerRepository
from app.services.audit_service import AuditService


class WorkerService:
    def __init__(self, db: Session) -> None:
        self.repository = WorkerRepository(db)
        self.audit_service = AuditService(db)
        self.db = db

    def list(self) -> list[User]:
        return self.repository.list()

    def list_for_scope(self, scope: AccessScope) -> list[User]:
        return self.repository.list_for_scope(scope)

    def get(self, user_id: UUID) -> User | None:
        return self.repository.get(user_id)

    def update_availability(self, user_id: UUID, availability_status: AvailabilityStatus) -> WorkerProfile | None:
        profile = self.repository.get_profile(user_id)
        if profile is None:
            return None

        profile.availability_status = availability_status
        saved = self.repository.save(profile)
        self.audit_service.log(
            action='worker.availability_updated',
            entity_type='worker_profile',
            entity_id=saved.id,
            actor_user_id=user_id,
            payload={'availability_status': availability_status.value},
        )
        self.db.commit()
        return saved
