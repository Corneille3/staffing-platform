from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.models.enums import UserRole
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.user import User


class OrganizationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list(self) -> list[Organization]:
        return list(self.db.scalars(select(Organization).order_by(Organization.name)).all())

    def list_for_scope(self, scope: AccessScope) -> list[Organization]:
        # Removed orgs are a soft-delete — filter them here so every org
        # listing (APF page, admin pickers) forgets them in one place.
        stmt = (
            select(Organization)
            .where(Organization.is_active.is_(True))
            .order_by(Organization.name)
        )
        if scope.is_platform_admin or scope.is_network_admin:
            if not scope.tenant_id:
                return []
            return list(self.db.scalars(
                stmt.where(Organization.tenant_id == scope.tenant_id)
            ).all())
        if not scope.org_ids:
            return []
        return list(self.db.scalars(stmt.where(Organization.id.in_(scope.org_ids))).all())

    def get(self, organization_id: UUID) -> Organization | None:
        return self.db.get(Organization, organization_id)

    def active_admins(self, organization_id: UUID) -> list[User]:
        """Active org_admins of one org — the recipient set for escalation
        emails and no-show alerts (SPEC_NOSHOW: shared, not copied)."""
        return list(self.db.scalars(
            select(User)
            .join(OrganizationMembership, OrganizationMembership.user_id == User.id)
            .where(
                OrganizationMembership.organization_id == organization_id,
                OrganizationMembership.role == UserRole.ORG_ADMIN,
                OrganizationMembership.is_active.is_(True),
                User.is_active.is_(True),
            )
        ))
