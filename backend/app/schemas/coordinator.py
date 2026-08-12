from uuid import UUID

from pydantic import BaseModel

from app.schemas.common import NormalizedEmailLoose, NormalizedPhone, ORMModel
from app.schemas.organization import OrganizationRead


class CoordinatorInviteCreate(BaseModel):
    first_name: str
    last_name: str
    email: NormalizedEmailLoose
    phone: NormalizedPhone = None
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
