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
        if scope.is_apf:
            return list(self.db.scalars(stmt).all())
        # Org admins (and workers) only see orgs they belong to.
        if not scope.org_ids:
            return []
        stmt = stmt.where(Organization.id.in_(scope.org_ids))
        return list(self.db.scalars(stmt).all())

    def get(self, organization_id: UUID) -> Organization | None:
        return self.db.get(Organization, organization_id)
