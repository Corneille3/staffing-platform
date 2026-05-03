from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.models.organization import Organization


class OrganizationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list(self) -> list[Organization]:
        return list(self.db.scalars(select(Organization).order_by(Organization.name)).all())

    def list_for_scope(self, scope: AccessScope) -> list[Organization]:
        stmt = select(Organization).order_by(Organization.name)
        if scope.is_platform_admin:
            return list(self.db.scalars(stmt).all())
        if scope.is_network_admin:
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
