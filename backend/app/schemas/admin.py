"""Admin-surface schemas (substitutes ranking, request drafts).

Distinct from /apf schemas because the admin surface is the dispatcher view
(per-org or per-tenant for coordinators), not network oversight.
"""
from datetime import date as date_cls
from uuid import UUID

from pydantic import BaseModel

from datetime import datetime, time as time_cls
from enum import Enum

from app.schemas.apf import ActivityRow
from app.schemas.eligibility import EligibilityReason
from app.schemas.worker import WorkerRead


class AdminSubstituteRow(BaseModel):
    """A worker row, optionally enriched with match score for a specific request."""
    worker: WorkerRead
    match_score: int | None = None
    eligible: bool | None = None
    reasons: list[EligibilityReason] = []


class RankAgainstBrief(BaseModel):
    id: UUID
    title: str
    city: str
    work_date: date_cls
    language_requirement: str | None = None
    required_qualifications: list[str] = []
    required_certifications: list[str] = []


class AdminSubstitutesResponse(BaseModel):
    items: list[AdminSubstituteRow]
    rank_against: RankAgainstBrief | None = None


# --- /admin/organizations (multi-site coordinator screen, ADMIN_ORG_HISTORY_HANDOFF §2) ---

class AdminOrgMetrics(BaseModel):
    fill_rate_30d: int
    requests_30d: int
    filled_30d: int
    open_requests: int


class AdminOrgCoordinator(BaseModel):
    id: UUID
    name: str
    role: str


class AdminOrgRosterToday(BaseModel):
    on_site: int
    substitutes_arriving: int


class AdminOrganizationSite(BaseModel):
    id: UUID
    parent_organization_id: UUID | None = None
    name: str
    type: str
    city: str
    neighbourhood: str | None = None
    region: str | None = None
    address_line1: str | None = None
    postal_code: str | None = None
    capacity: int | None = None
    enrolled_count: int | None = None
    hours_label: str | None = None
    preferred_language: str
    contact_phone: str | None = None
    contact_email: str | None = None
    is_active: bool
    metrics: AdminOrgMetrics
    coordinators: list[AdminOrgCoordinator] = []
    roster_today: AdminOrgRosterToday


class AdminOrganizationsResponse(BaseModel):
    items: list[AdminOrganizationSite]


class AdminOrganizationUpdate(BaseModel):
    """Partial edit for a site (the §2.3 edit modal). Only these fields."""
    name: str | None = None
    address_line1: str | None = None
    hours_label: str | None = None
    contact_phone: str | None = None
    preferred_language: str | None = None
    capacity: int | None = None
    enrolled_count: int | None = None


# --- /admin/activity (coordinator audit timeline, ADMIN_ORG_HISTORY_HANDOFF §3) ---

class AdminActivityFilter(str, Enum):
    ALL = 'all'
    POSTED = 'posted'
    ACCEPTED = 'accepted'
    DECLINED = 'declined'
    ASSIGNED = 'assigned'
    COMPLETED = 'completed'
    CANCELLED = 'cancelled'
    EXPIRED = 'expired'
    INVITED = 'invited'


class AdminActivityCounts(BaseModel):
    all: int
    posted: int
    accepted: int
    declined: int
    assigned: int
    completed: int
    cancelled: int
    expired: int
    invited: int


class AdminActivityKpis(BaseModel):
    posted: int
    filled: int
    cancelled: int
    expired: int
    fill_rate: int
    avg_time_to_fill_minutes: int | None = None
    sites: int = 0


class AdminActivity(BaseModel):
    items: list[ActivityRow]
    next_cursor: datetime | None = None
    counts: AdminActivityCounts
    kpis: AdminActivityKpis


# --- /admin/requests index (triage list, ADMIN_ORG_HISTORY_HANDOFF §4) ---

class AdminRequestMetrics(BaseModel):
    notified: int
    viewed: int
    accepted: int
    declined: int
    responses: int


class AdminRequestTopMatch(BaseModel):
    user_id: UUID
    name: str
    match_score: int | None = None


class AdminRequestAssignedWorker(BaseModel):
    user_id: UUID
    name: str


class AdminRequestSummary(BaseModel):
    id: UUID
    public_id: str
    urgent: bool
    status: str
    role: str | None = None
    title: str
    organization_id: UUID
    work_date: date_cls
    start_time: time_cls
    end_time: time_cls
    language_requirement: str | None = None
    required_qualifications: list[str] = []
    urgency_level: int
    created_at: datetime
    metrics: AdminRequestMetrics
    top_match: AdminRequestTopMatch | None = None
    assigned_worker: AdminRequestAssignedWorker | None = None


class AdminRequestCounts(BaseModel):
    active: int
    assigned: int
    all: int


class AdminRequestsResponse(BaseModel):
    items: list[AdminRequestSummary]
    counts: AdminRequestCounts
    next_cursor: str | None = None


# --- /admin/dashboard (Coverage Desk, ADMIN_HANDOFF §3) ---

class AdminDashboardCoordinator(BaseModel):
    first_name: str


class AdminDashboardUrgent(AdminRequestSummary):
    elapsed: str
    starts_in: str


class AdminDashboardKpis(BaseModel):
    fill_rate_week: int
    fill_rate_delta: int
    avg_time_to_fill_minutes: int | None = None
    open_count: int
    assigned_count: int = 0
    substitutes_ready: int


class AdminRosterEntry(BaseModel):
    name: str
    role: str | None = None
    starts_at: time_cls
    ends_at: time_cls
    status: str


class AdminDashboard(BaseModel):
    coordinator: AdminDashboardCoordinator
    urgent_now: AdminDashboardUrgent | None = None
    kpis: AdminDashboardKpis
    live_requests: list[AdminRequestSummary]
    activity_today: list[ActivityRow]
    week_fill_rate: list[int]
    roster_today: list[AdminRosterEntry]
