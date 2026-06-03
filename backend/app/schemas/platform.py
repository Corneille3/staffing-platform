"""Platform-operator (tier 0) schemas — MULTITENANCY_HANDOFF §5.

These responses carry ONLY aggregate counts + tenant/admin identity — never
worker names, request titles, or shift details. The privacy boundary (§5.2).
"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


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
