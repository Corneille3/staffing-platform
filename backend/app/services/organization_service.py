from uuid import UUID

from sqlalchemy.orm import Session

from app.models.organization import Organization
from app.repositories.organization_repository import OrganizationRepository


class OrganizationService:
    def __init__(self, db: Session) -> None:
        self.repository = OrganizationRepository(db)

    def list(self) -> list[Organization]:
        return self.repository.list()

    def get(self, organization_id: UUID) -> Organization | None:
        return self.repository.get(organization_id)
