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


class CoordinatorPhoneUpdate(BaseModel):
    """PATCH /coordinators/{id} — the network admin fixes a coordinator's
    mobile number (parked #7). Required but nullable: "" or null clears it
    (NormalizedPhone maps empty → None); anything else is stored in E.164 so
    the no-show SMS has somewhere to go. Only the number is writable — names,
    email and organizations stay invite-time facts, and the SMS switch stays
    the coordinator's own (PATCH /auth/profile)."""

    phone: NormalizedPhone
