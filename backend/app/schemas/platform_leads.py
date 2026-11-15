"""Schemas for the operator-level sales pipeline (SPEC_PLATFORM_LEADS §5).

Segment, kind, source and ban phase are validated here rather than by
Postgres enums: adding a segment is an edit to these tuples, not a migration.
"""
from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import NormalizedEmail, NormalizedPhone

SEGMENTS = (
    'rpa_qc', 'chsld_qc', 'cpe_qc', 'ltc_on', 'retirement_on', 'agency_on',
    'childcare_sk', 'ltc_sk', 'school_board', 'other',
)
KINDS = ('prospect', 'enterprise', 'channel')
SOURCES = (
    'research', 'facebook_ad', 'linkedin_dm', 'website_form', 'referral', 'cold_outreach', 'event', 'other',
)
BAN_PHASES = ('P1', 'P2', 'P3', 'none')
WAVES = ('A', 'B', 'C')
STATUSES = ('new', 'contacted', 'demo_booked', 'pilot', 'invited', 'won', 'lost')
# What an operator may log by hand; the other event types are written by the system.
MANUAL_EVENT_TYPES = ('note', 'call', 'email', 'meeting', 'demo')

Segment = Literal[
    'rpa_qc', 'chsld_qc', 'cpe_qc', 'ltc_on', 'retirement_on', 'agency_on',
    'childcare_sk', 'ltc_sk', 'school_board', 'other',
]
Kind = Literal['prospect', 'enterprise', 'channel']
Source = Literal[
    'research', 'facebook_ad', 'linkedin_dm', 'website_form', 'referral', 'cold_outreach', 'event', 'other',
]
BanPhase = Literal['P1', 'P2', 'P3', 'none']
Wave = Literal['A', 'B', 'C']
Status = Literal['new', 'contacted', 'demo_booked', 'pilot', 'invited', 'won', 'lost']
Language = Literal['fr', 'en']
Province = Field(min_length=2, max_length=2, pattern=r'^[A-Z]{2}$')

# Free-text fields an operator can blank out again: '' and whitespace mean NULL.
_BLANKABLE = (
    'external_ref', 'subtype', 'capacity_note', 'city', 'regions', 'website', 'phone', 'email',
    'contact_name', 'contact_title', 'lost_reason', 'source_detail', 'next_action', 'notes',
    'source_url',
)


class _LeadFields(BaseModel):
    """Editable columns shared by create and update (all optional here)."""

    external_ref: str | None = Field(default=None, max_length=40)
    subtype: str | None = Field(default=None, max_length=120)
    site_count: int | None = Field(default=None, ge=0, le=100000)
    capacity_note: str | None = Field(default=None, max_length=500)
    city: str | None = Field(default=None, max_length=120)
    regions: str | None = Field(default=None, max_length=1000)
    website: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=60)
    email: str | None = Field(default=None, max_length=255)
    contact_name: str | None = Field(default=None, max_length=160)
    contact_title: str | None = Field(default=None, max_length=160)
    hiring_signal: bool | None = None
    score: int | None = Field(default=None, ge=0, le=10)
    wave: Wave | None = None
    lost_reason: str | None = Field(default=None, max_length=1000)
    source_detail: str | None = Field(default=None, max_length=255)
    next_action: str | None = Field(default=None, max_length=1000)
    next_action_at: date | None = None
    notes: str | None = Field(default=None, max_length=10000)
    source_url: str | None = Field(default=None, max_length=2000)

    @field_validator(*_BLANKABLE, mode='before')
    @classmethod
    def _blank_to_none(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value


class LeadCreate(_LeadFields):
    org_name: str = Field(min_length=1, max_length=255)
    segment: Segment
    province: str = Province
    kind: Kind = 'prospect'
    agency_ban_phase: BanPhase = 'none'
    language: Language = 'fr'
    source: Source = 'research'
    status: Status = 'new'

    @field_validator('org_name', mode='before')
    @classmethod
    def _strip_name(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class LeadUpdate(_LeadFields):
    """PATCH body — only the keys sent are applied. A `status` key runs the
    state machine (§4)."""

    org_name: str | None = Field(default=None, min_length=1, max_length=255)
    segment: Segment | None = None
    province: str | None = Field(default=None, min_length=2, max_length=2, pattern=r'^[A-Z]{2}$')
    kind: Kind | None = None
    agency_ban_phase: BanPhase | None = None
    language: Language | None = None
    source: Source | None = None
    status: Status | None = None


class LeadEventCreate(BaseModel):
    type: Literal['note', 'call', 'email', 'meeting', 'demo']
    body: str = Field(min_length=1, max_length=5000)

    @field_validator('body', mode='before')
    @classmethod
    def _strip_body(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class LeadEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    type: str
    from_status: str | None = None
    to_status: str | None = None
    body: str | None = None
    actor_id: UUID | None = None
    actor_name: str | None = None
    created_at: datetime


class LeadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    external_ref: str | None
    org_name: str
    segment: str
    subtype: str | None
    kind: str
    site_count: int | None
    capacity_note: str | None
    city: str | None
    province: str
    regions: str | None
    agency_ban_phase: str
    language: str
    website: str | None
    phone: str | None
    email: str | None
    contact_name: str | None
    contact_title: str | None
    hiring_signal: bool | None
    score: int | None
    wave: str | None
    status: str
    lost_reason: str | None
    source: str
    source_detail: str | None
    next_action: str | None
    next_action_at: date | None
    notes: str | None
    source_url: str | None
    tenant_id: UUID | None
    converted_at: datetime | None
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime

    @field_validator('status', mode='before')
    @classmethod
    def _enum_value(cls, value: object) -> object:
        return getattr(value, 'value', value)


class LeadTenantSummary(BaseModel):
    """The tenant a lead was invited as — just enough to label the link."""

    id: UUID
    name: str
    slug: str
    status: str


class LeadDetail(LeadOut):
    """The lead + its 50 most recent events, newest first."""

    events: list[LeadEventOut] = []
    tenant: LeadTenantSummary | None = None


class LeadInvite(BaseModel):
    """« Invite as a network » (§7). The lead knows the organization; the
    operator supplies what a tenant needs on top: a slug and a named admin.
    `name`, `admin_phone` and the language fall back to the lead's values."""

    slug: str = Field(min_length=2, max_length=100, pattern=r'^[a-z0-9][a-z0-9-]*[a-z0-9]$')
    admin_first_name: str = Field(min_length=1, max_length=100)
    admin_last_name: str = Field(min_length=1, max_length=100)
    admin_email: NormalizedEmail
    name: str | None = Field(default=None, min_length=1, max_length=255)
    region: str | None = Field(default=None, max_length=100)
    admin_phone: NormalizedPhone = None
    admin_preferred_language: Language | None = None


class LeadInviteResult(BaseModel):
    lead: LeadOut
    tenant: LeadTenantSummary


class LeadListResponse(BaseModel):
    items: list[LeadOut]
    total: int
    limit: int
    offset: int


class SegmentWaveCount(BaseModel):
    segment: str
    wave: str | None
    count: int


class LeadStats(BaseModel):
    total: int
    by_status: dict[str, int]
    by_segment_wave: list[SegmentWaveCount]
    open_pipeline: int        # everything that is neither won nor lost
    overdue_actions: int      # next_action_at < today, still open
    in_demo_or_pilot: int
    new_website_requests: int  # source website_form, still `new`
    # won ÷ leads that got past `new`; None while nothing has been contacted.
    conversion_rate: float | None


class LeadImportSkipped(BaseModel):
    row: int
    reason: str


class LeadImportResult(BaseModel):
    created: int
    updated: int
    unchanged: int
    skipped: list[LeadImportSkipped]


class PublicLeadIntake(BaseModel):
    """What a marketing site may send — and nothing else (extra keys are
    refused). Organization-level contact details only (§9)."""

    model_config = ConfigDict(extra='forbid')

    org_name: str = Field(min_length=1, max_length=255)
    email: NormalizedEmail
    contact_name: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=60)
    segment: Segment = 'other'
    province: str = Field(default='QC', min_length=2, max_length=2, pattern=r'^[A-Z]{2}$')
    language: Language = 'fr'
    notes: str | None = Field(default=None, max_length=5000)
    # Which site the form lives on ("kouamvision.com"); kept in source_detail.
    site: str | None = Field(default=None, max_length=120, pattern=r'^[a-z0-9][a-z0-9.-]*$')

    @field_validator('org_name', 'contact_name', 'phone', 'notes', mode='before')
    @classmethod
    def _strip(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value


class PublicLeadIntakeResult(BaseModel):
    status: Literal['received'] = 'received'
