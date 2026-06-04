"""Platform-operator (tier 0) schemas — MULTITENANCY_HANDOFF §5.

These responses carry ONLY aggregate counts + tenant/admin identity — never
worker names, request titles, or shift details. The privacy boundary (§5.2).
"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class PlatformKpis(BaseModel):
    active_tenants: int
    total_orgs: int
    total_substitutes: int
    weighted_fill_rate: int | None = None  # 0-100 across all tenants


class PlatformTenantRow(BaseModel):
    id: UUID
    name: str
    slug: str
    region: str | None = None
    status: str
    org_count: int
    substitute_count: int
    fill_rate_30d: int | None = None
    admin_name: str | None = None
    admin_email: str | None = None
    since: datetime | None = None  # activated_at, else created_at


class PlatformTenantsResponse(BaseModel):
    kpis: PlatformKpis
    tenants: list[PlatformTenantRow]


class PlatformTenantCreate(BaseModel):
    """Invite a new network (tenant). Same fields as the network create, named
    per the spec's §5.3 body."""
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=2, max_length=100, pattern=r'^[a-z0-9][a-z0-9-]*[a-z0-9]$')
    region: str | None = Field(default=None, max_length=100)
    admin_first_name: str = Field(..., min_length=1, max_length=100)
    admin_last_name: str = Field(..., min_length=1, max_length=100)
    admin_email: EmailStr
    admin_phone: str | None = Field(default=None, max_length=50)
    admin_preferred_language: str = Field(default='fr', pattern=r'^(fr|en|bilingual)$')


class PlatformTenantCreated(BaseModel):
    id: UUID
    slug: str
    status: str


class PlatformOperatorRead(BaseModel):
    """One tier-0 operator row (PLATFORM_HANDOFF §2.1)."""
    id: UUID
    user_id: UUID
    first_name: str
    last_name: str
    email: str
    role: str  # owner | operator | support
    mfa_enabled: bool
    status: str  # pending (invite not yet accepted) | active
    invited_at: datetime | None = None
    last_active_at: datetime | None = None


class PlatformOperatorsResponse(BaseModel):
    operators: list[PlatformOperatorRead]
    # The caller's own tier-0 role — lets the UI disable owner-only controls.
    viewer_role: str | None = None


class PlatformOperatorInvite(BaseModel):
    email: EmailStr
    role: str = Field(pattern=r'^(owner|operator|support)$')
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    preferred_language: str = Field(default='fr', pattern=r'^(fr|en|bilingual)$')


class PlatformOperatorRoleUpdate(BaseModel):
    role: str = Field(pattern=r'^(owner|operator|support)$')


class PlatformSettingsRead(BaseModel):
    """New-tenant defaults + reserved-slug blocklist (PLATFORM_HANDOFF §2.3-2.4)."""
    model_config = ConfigDict(from_attributes=True)

    default_language: str
    trial_length_days: int
    invite_expiry_days: int
    data_residency: str  # locked
    orphan_retention_days: int
    reserved_slugs: list[str]


class PlatformSettingsUpdate(BaseModel):
    default_language: str | None = Field(default=None, pattern=r'^(fr|en|bilingual)$')
    trial_length_days: int | None = Field(default=None, ge=0, le=365)
    invite_expiry_days: int | None = Field(default=None, ge=1, le=90)
    orphan_retention_days: int | None = Field(default=None, ge=1, le=3650)
    reserved_slugs: list[str] | None = None
