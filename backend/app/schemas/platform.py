"""Platform-operator (tier 0) schemas — MULTITENANCY_HANDOFF §5.

These responses carry ONLY aggregate counts + tenant/admin identity — never
worker names, request titles, or shift details. The privacy boundary (§5.2).
"""
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import NormalizedEmail, NormalizedPhone


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
    # Set when the tenant was invited from a sales lead (/platform/leads).
    lead_segment: str | None = None
    lead_source: str | None = None
    # That lead's pipeline stage: `pilot` marks a trial in progress, and a
    # lead still `invited` / `pilot` makes the removal ask for a reason.
    lead_status: str | None = None


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
    admin_email: NormalizedEmail
    # Normalized to E.164 at the boundary — see TenantNetworkCreate.admin_phone.
    admin_phone: NormalizedPhone = None
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
    role: str  # owner | operator | support | marketing
    mfa_enabled: bool
    status: str  # pending (invite not yet accepted) | active
    invited_at: datetime | None = None
    last_active_at: datetime | None = None


class PlatformOperatorsResponse(BaseModel):
    operators: list[PlatformOperatorRead]
    # The caller's own tier-0 role — lets the UI disable owner-only controls.
    viewer_role: str | None = None


class PlatformOperatorInvite(BaseModel):
    email: NormalizedEmail
    role: str = Field(pattern=r'^(owner|operator|support|marketing)$')
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    preferred_language: str = Field(default='fr', pattern=r'^(fr|en|bilingual)$')


class PlatformOperatorRoleUpdate(BaseModel):
    role: str = Field(pattern=r'^(owner|operator|support|marketing)$')


class PlatformSettingsRead(BaseModel):
    """New-tenant defaults + reserved-slug blocklist (PLATFORM_HANDOFF §2.3-2.4)."""
    model_config = ConfigDict(from_attributes=True)

    default_language: str
    trial_length_days: int
    invite_expiry_days: int
    data_residency: str  # locked
    orphan_retention_days: int
    access_requires_approval: bool
    access_window_hours: int
    reserved_slugs: list[str]


class PlatformSettingsUpdate(BaseModel):
    default_language: str | None = Field(default=None, pattern=r'^(fr|en|bilingual)$')
    trial_length_days: int | None = Field(default=None, ge=0, le=365)
    invite_expiry_days: int | None = Field(default=None, ge=1, le=90)
    orphan_retention_days: int | None = Field(default=None, ge=1, le=3650)
    access_requires_approval: bool | None = None
    access_window_hours: int | None = Field(default=None, ge=1, le=72)
    reserved_slugs: list[str] | None = None


class TenantAccessRequestCreate(BaseModel):
    """An operator asks to look inside one tenant (PLATFORM_HANDOFF §2.2)."""
    reason: str = Field(min_length=5, max_length=500)


class TenantAccessGrantRead(BaseModel):
    id: UUID
    tenant_id: UUID
    tenant_name: str
    operator_user_id: UUID
    operator_name: str
    operator_email: str
    reason: str
    status: str  # requested | approved | active | expired | denied
    requested_at: datetime | None = None
    expires_at: datetime | None = None

    @classmethod
    def from_row(cls, grant, operator, tenant) -> 'TenantAccessGrantRead':
        """Build from the (grant, operator User, Tenant) join the service returns."""
        return cls(
            id=grant.id,
            tenant_id=grant.tenant_id,
            tenant_name=tenant.name,
            operator_user_id=grant.operator_user_id,
            operator_name=f'{operator.first_name} {operator.last_name}'.strip(),
            operator_email=operator.email,
            reason=grant.reason,
            status=grant.status.value,
            requested_at=grant.requested_at,
            expires_at=grant.expires_at,
        )


class TenantAccessGrantsResponse(BaseModel):
    grants: list[TenantAccessGrantRead]
    # Operators currently inside any tenant — should usually be 0.
    active_count: int


class OrphanRead(BaseModel):
    """One orphan account found by the housekeeping scan.

    ``kind='clerk'`` → ``id`` is the Clerk user id (no DB row exists).
    ``kind='db'`` → ``id`` is the users.id UUID (no Clerk requirement).
    """
    kind: Literal['clerk', 'db']
    id: str
    email: str | None = None
    name: str | None = None
    role: str | None = None  # db kind only
    created_at: datetime | None = None
    last_sign_in_at: datetime | None = None  # clerk kind only
    clerk_linked: bool | None = None  # db kind only


class OrphanScanResponse(BaseModel):
    clerk_only: list[OrphanRead]
    db_only: list[OrphanRead]
    # False when the Clerk Backend API is unreachable or unconfigured —
    # the clerk_only list is then unknown, not empty.
    clerk_available: bool
    scanned_at: datetime


class OrphanRemovePayload(BaseModel):
    kind: Literal['clerk', 'db']
    id: str = Field(min_length=1, max_length=255)


class PlatformAuditRow(BaseModel):
    """One line of the tier-0 audit trail, ready to display. `target_label`
    is the human name of what was touched (a network, an email, a lead's
    organization) when one can be found; `details` is the stored payload."""
    id: UUID
    created_at: datetime
    action: str
    actor_name: str | None
    actor_email: str | None
    target_type: str | None
    target_id: str | None
    target_label: str | None
    details: dict


class PlatformAuditResponse(BaseModel):
    rows: list[PlatformAuditRow]
    total: int


class OverviewAttentionItem(BaseModel):
    """One line of « to watch » on the overview. `kind` picks the wording and
    the link on the screen:

    - `new_website_requests`, `overdue_followups` — a count (owner only);
    - `pilot_overdue` — one lead past its pilot end (owner only);
    - `invite_stale`, `onboarding_stuck` — a tenant still pending / in the
      setup wizard a week after its invitation;
    - `tenant_suspended`;
    - `access_request_pending` — waiting on the tenant's admin (`info_only`).
    """
    kind: str
    count: int = 1
    name: str | None = None
    days: int | None = None
    tenant_id: UUID | None = None
    lead_id: UUID | None = None
    info_only: bool = False


class OverviewTenantCounts(BaseModel):
    pending: int
    onboarding: int
    active: int
    suspended: int


class OverviewActivity(BaseModel):
    """Requests published in the last `days` days, all live tenants together."""
    days: int
    published: int
    filled: int
    expired: int
    fill_rate: int | None = None  # 0-100; None when nothing was published


class OverviewLeads(BaseModel):
    total: int
    open_pipeline: int
    by_status: dict[str, int]


class PlatformOverview(BaseModel):
    """`GET /platform/overview`. `leads` and `audit` are null for anyone but
    an owner — the API withholds them, the screen has nothing to hide."""
    generated_at: datetime
    attention: list[OverviewAttentionItem]
    tenants: OverviewTenantCounts
    activity: OverviewActivity
    leads: OverviewLeads | None = None
    audit: list[PlatformAuditRow] | None = None
