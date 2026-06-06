from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class TenantNetworkCreate(BaseModel):
    """Payload for creating a new tenant + first network admin in one shot.

    Used by ``POST /api/v1/networks`` (platform admin only).
    """

    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=2, max_length=100, pattern=r'^[a-z0-9][a-z0-9-]*[a-z0-9]$')
    region: str | None = Field(default=None, max_length=100)
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
    status: str = 'active'
    region: str | None = None
    is_active: bool
    activated_at: datetime | None = None
    created_at: datetime
    network_admin: TenantAdminRead | None = None


class TenantProfileRead(BaseModel):
    """The caller's own tenant — for the onboarding wizard + workspace header."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    region: str | None = None
    status: str
    preferred_language: str
    # True when the caller sees this tenant through an ACTIVE access grant
    # (PLATFORM_HANDOFF §2.2) rather than a membership — the workspace UI
    # labels the visit read-only. Set by the route from scope.grant_access.
    via_grant: bool = False


class TenantProfileUpdate(BaseModel):
    """Wizard step 1 — confirm/edit the network's name, region, language.
    Slug is not editable here (set at invite; changing it later is a separate
    concern under path-based routing)."""
    name: str | None = Field(default=None, min_length=1, max_length=255)
    region: str | None = Field(default=None, max_length=100)
    preferred_language: str | None = Field(default=None, pattern=r'^(fr|en|bilingual)$')
