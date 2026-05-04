from uuid import UUID

from pydantic import BaseModel

from app.schemas.common import ORMModel
from app.schemas.organization import OrganizationRead


class CoordinatorInviteCreate(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone: str | None = None
    preferred_language: str = 'fr'
    org_ids: list[UUID]


class CoordinatorRead(ORMModel):
    id: UUID
    first_name: str
    last_name: str
    email: str
    phone: str | None
    preferred_language: str
    is_active: bool
    organizations: list[OrganizationRead]
