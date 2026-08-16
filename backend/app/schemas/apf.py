from datetime import date as date_cls
from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel

from app.schemas.common import NormalizedPhone, ORMModel


class ApfSnapshotKpis(BaseModel):
    total_requests: int
    filled_count: int
    fill_rate: int
    active_substitutes: int
    unfilled_count: int
    avg_fill_hours: float | None
    organizations_count: int


class OrgActivityRow(ORMModel):
    id: UUID
    name: str
    city: str
    region: str | None = None
    type: str
    total: int
    filled: int
    open: int


class RecentClosedRequestRow(ORMModel):
    id: UUID
    title: str
    status: str
    city: str
    work_date: date_cls
    organization_id: UUID
    organization_name: str | None = None


class ApfSnapshot(BaseModel):
    kpis: ApfSnapshotKpis
    status_breakdown: dict[str, int]
    shortage_cities: list[str]
    org_activity: list[OrgActivityRow]
    recent_closed_requests: list[RecentClosedRequestRow]


class ActivityFilter(str, Enum):
    ALL = 'all'
    ASSIGNED = 'assigned'
    CANCELLED = 'cancelled'
    ESCALATED = 'escalated'
    INVITATIONS = 'invitations'
    REMOVALS = 'removals'


class ActivityActor(BaseModel):
    id: UUID
    first_name: str
    last_name: str
    role: str


class ActivityOrganization(BaseModel):
    id: UUID
    name: str


class ActivityRow(BaseModel):
    id: UUID
    created_at: datetime
    action: str
    entity_type: str
    entity_id: UUID | None = None
    actor: ActivityActor | None = None
    organization: ActivityOrganization | None = None
    payload: dict
    request_title: str | None = None


class ActivityCounts(BaseModel):
    all: int
    assigned: int
    cancelled: int
    escalated: int
    invitations: int
    removals: int


class ApfActivity(BaseModel):
    items: list[ActivityRow]
    next_cursor: datetime | None = None
    counts: ActivityCounts


class NetworkPoolKpis(BaseModel):
    total: int
    available_now: int
    multi_org_pct: int
    avg_reliability: int
    shortage_cities_count: int


class CityDistributionRow(BaseModel):
    city: str
    total: int
    available: int
    coverage_pct: int  # available / total * 100; clamped 0-100
    languages: list[str]  # mono-pill list, deduped


class ContributorRow(BaseModel):
    id: UUID
    first_name: str
    last_name: str
    cities: list[str]
    role: str
    org_count: int
    shifts_30d: int
    languages: list[str]
    reliability: int


class NetworkPool(BaseModel):
    kpis: NetworkPoolKpis
    distribution: list[CityDistributionRow]
    top_contributors: list[ContributorRow]


class BulkInviteEntry(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone: NormalizedPhone = None
    preferred_language: str = 'fr'


class BulkInvitePayload(BaseModel):
    invitees: list[BulkInviteEntry]


class BulkInviteOutcome(BaseModel):
    email: str
    status: str  # 'invited' | 'skipped'
    reason: str | None = None
    user_id: UUID | None = None


class BulkInviteResult(BaseModel):
    invited_count: int
    skipped_count: int
    outcomes: list[BulkInviteOutcome]


class ReliabilityRecomputeResult(BaseModel):
    updated: int


class OrgSnapshotKpis(BaseModel):
    total_requests: int
    filled_count: int
    fill_rate: int
    unfilled_count: int
    avg_fill_hours: float | None
    active_substitutes_in_city: int


class OrgRequestRow(ORMModel):
    id: UUID
    title: str
    status: str
    city: str
    work_date: date_cls
    created_at: datetime


class OrgSnapshot(BaseModel):
    id: UUID
    name: str
    type: str
    city: str
    region: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    preferred_language: str
    is_active: bool
    kpis: OrgSnapshotKpis
    status_breakdown: dict[str, int]
    recent_closed_requests: list[OrgRequestRow]
    upcoming_open_requests: list[OrgRequestRow]


class ApfExportFormat(str, Enum):
    CSV = 'csv'


class ApfExportView(str, Enum):
    REQUESTS = 'requests'
    # Payroll view (SPEC_CHECKOUT_HOURS §6): one row per assignment with
    # scheduled vs actual times, derived worked hours, and correction audit.
    WORKED_HOURS = 'worked_hours'


class ApfExportRequest(BaseModel):
    date_from: date_cls
    date_to: date_cls
    org_ids: list[UUID] | None = None
    format: ApfExportFormat = ApfExportFormat.CSV
    view: ApfExportView = ApfExportView.REQUESTS


class ApfExportJob(BaseModel):
    id: UUID
    status: str  # 'pending' | 'ready' | 'failed'
    created_at: datetime
    completed_at: datetime | None = None
    row_count: int | None = None
    download_url: str | None = None
    error: str | None = None
