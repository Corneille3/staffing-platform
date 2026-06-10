"""Coordinator-facing self-serve replacement schemas (SELF_SERVE_REPLACEMENT §5,
§6.1) — the self-filled dashboard + the per-org policy screen."""
from datetime import date, datetime, time
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import ReplacementPolicy, RequestRole


class AbsenceReportCreate(BaseModel):
    """Permanent staff describe a shift they'll miss (SELF_SERVE §1)."""
    organization_id: UUID
    role: RequestRole
    work_date: date
    start_time: time
    end_time: time
    reason: str | None = None  # sick | family | personal | other
    note: str | None = Field(default=None, max_length=500)


class MyAbsenceItem(BaseModel):
    """A worker's own reported absence + its live status, so they can leave and
    come back to see whether it was covered (the report-absence hub)."""
    request_id: UUID
    title: str
    role: str | None = None
    work_date: date
    start_time: time
    end_time: time
    reason: str | None = None
    status: str  # searching | filled | unfilled | cancelled
    claimed_by_name: str | None = None
    alerted: int
    viewed: int


class ReplacementFeedItem(BaseModel):
    request_id: UUID
    # worker_replacement (contractor release) | staff_absence (permanent staff)
    origin: str
    giver_name: str
    title: str
    work_date: date
    start_time: time
    end_time: time
    role: str | None = None
    reason: str | None = None
    # searching | filled | cancelled | unfilled
    status: str
    claimer_name: str | None = None
    released_at: datetime
    time_to_fill_minutes: int | None = None


class ReplacementKpis(BaseModel):
    released_this_week: int
    filled: int
    avg_time_to_fill_minutes: int | None = None
    unfilled: int


class ReplacementFeedResponse(BaseModel):
    kpis: ReplacementKpis
    items: list[ReplacementFeedItem]


class ReplacementPolicyRead(BaseModel):
    organization_id: UUID
    organization_name: str
    policy: ReplacementPolicy
    allowed_roles: list[str]
    min_release_lead_minutes: int

    model_config = {'from_attributes': True}


class ReplacementPolicyUpdate(BaseModel):
    policy: ReplacementPolicy | None = None
    allowed_roles: list[str] | None = None
    min_release_lead_minutes: int | None = Field(default=None, ge=0, le=1440)
