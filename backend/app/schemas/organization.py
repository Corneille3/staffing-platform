from uuid import UUID

from pydantic import BaseModel, EmailStr

from app.models.enums import OrganizationType
from app.schemas.common import TimestampedSchema


class OrganizationBase(BaseModel):
    name: str
    type: OrganizationType
    city: str
    region: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    postal_code: str | None = None
    contact_email: EmailStr | None = None
    contact_phone: str | None = None
    preferred_language: str = 'fr'
    is_active: bool = True


class OrganizationCreate(OrganizationBase):
    pass


class OrganizationRead(OrganizationBase, TimestampedSchema):
    id: UUID
