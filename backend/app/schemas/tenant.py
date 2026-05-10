from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class TenantNetworkCreate(BaseModel):
    """Payload for creating a new tenant + first network admin in one shot.

    Used by ``POST /api/v1/networks`` (platform admin only).
    """

    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=2, max_length=100, pattern=r'^[a-z0-9][a-z0-9-]*[a-z0-9]$')
    admin_first_name: str = Field(..., min_length=1, max_length=100)
    admin_last_name: str = Field(..., min_length=1, max_length=100)
    admin_email: EmailStr
    admin_phone: str | None = Field(default=None, max_length=50)
    admin_preferred_language: str = Field(default='fr', pattern=r'^(fr|en|bilingual)$')


class TenantAdminRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    first_name: str
    last_name: str
    email: str
    preferred_language: str
    clerk_user_id: str | None = None
    is_active: bool


class TenantNetworkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    is_active: bool
    created_at: datetime
    network_admin: TenantAdminRead | None = None
