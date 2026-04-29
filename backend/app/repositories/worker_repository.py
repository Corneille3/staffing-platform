from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.user import User
from app.models.enums import UserRole
from app.models.worker_profile import WorkerProfile


class WorkerRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list(self) -> list[User]:
        stmt = (
            select(User)
            .where(User.role == UserRole.WORKER)
            .options(
                selectinload(User.worker_profile).selectinload(WorkerProfile.region_records),
                selectinload(User.worker_profile).selectinload(WorkerProfile.qualification_records),
                selectinload(User.worker_profile).selectinload(WorkerProfile.certification_records),
            )
            .order_by(User.first_name, User.last_name)
        )
        return list(self.db.scalars(stmt).unique().all())

    def get(self, user_id: UUID) -> User | None:
        stmt = (
            select(User)
            .where(User.id == user_id, User.role == UserRole.WORKER)
            .options(
                selectinload(User.worker_profile).selectinload(WorkerProfile.region_records),
                selectinload(User.worker_profile).selectinload(WorkerProfile.qualification_records),
                selectinload(User.worker_profile).selectinload(WorkerProfile.certification_records),
            )
        )
        return self.db.scalar(stmt)

    def get_profile(self, user_id: UUID) -> WorkerProfile | None:
        stmt = select(WorkerProfile).where(WorkerProfile.user_id == user_id)
        return self.db.scalar(stmt)

    def save(self, profile: WorkerProfile) -> WorkerProfile:
        self.db.add(profile)
        self.db.flush()
        self.db.refresh(profile)
        return profile
