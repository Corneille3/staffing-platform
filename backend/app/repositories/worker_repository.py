from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.auth.scope import AccessScope
from app.models.enums import UserRole
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.models.worker_profile import WorkerProfile


class WorkerRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _base_list_stmt(self):
        # Active users sort first; inactive (removed) come after for audit
        # visibility — the frontend renders them with a muted "removed" tag.
        return (
            select(User)
            .where(User.role == UserRole.WORKER)
            .options(
                selectinload(User.worker_profile).selectinload(WorkerProfile.region_records),
                selectinload(User.worker_profile).selectinload(WorkerProfile.qualification_records),
                selectinload(User.worker_profile).selectinload(WorkerProfile.certification_records),
            )
            .order_by(User.is_active.desc(), User.first_name, User.last_name)
        )

    def _with_tenant(self, stmt, tenant_id: UUID):
        # Note: no ``TenantMembership.is_active`` filter — we want soft-deleted
        # users to remain visible in the listing as "removed" entries. They're
        # excluded from operational logic (matching, dispatch) elsewhere via
        # ``User.is_active`` checks.
        return stmt.join(TenantMembership, TenantMembership.user_id == User.id).where(
            TenantMembership.tenant_id == tenant_id,
        )

    def list(self) -> list[User]:
        return list(self.db.scalars(self._base_list_stmt()).unique().all())

    def list_for_tenant(self, tenant_id: UUID) -> list[User]:
        return list(self.db.scalars(
            self._with_tenant(self._base_list_stmt(), tenant_id)
        ).unique().all())

    def list_for_scope(self, scope: AccessScope) -> list[User]:
        stmt = self._base_list_stmt()
        if scope.is_platform_admin or scope.is_network_admin or scope.is_org_admin:
            if not scope.tenant_id:
                return []
            return list(self.db.scalars(self._with_tenant(stmt, scope.tenant_id)).unique().all())
        # Worker: only themselves.
        stmt = stmt.where(User.id == scope.user.id)
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
