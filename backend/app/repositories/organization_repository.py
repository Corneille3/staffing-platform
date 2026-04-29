from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.organization import Organization


class OrganizationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list(self) -> list[Organization]:
        return list(self.db.scalars(select(Organization).order_by(Organization.name)).all())

    def get(self, organization_id: UUID) -> Organization | None:
        return self.db.get(Organization, organization_id)
