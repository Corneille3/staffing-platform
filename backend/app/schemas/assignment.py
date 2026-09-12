from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import AssignmentStatus
from app.schemas.common import ORMModel


class AssignmentRead(ORMModel):
    id: UUID
    staffing_request_id: UUID
    worker_user_id: UUID
    assigned_by_user_id: UUID
    status: AssignmentStatus
    assigned_at: datetime
    confirmed_at: datetime | None = None
    cancelled_at: datetime | None = None
    completed_at: datetime | None = None
    checked_in_at: datetime | None = None
    checked_in_latitude: Decimal | None = None
    checked_in_longitude: Decimal | None = None
    checked_out_at: datetime | None = None
    checked_out_latitude: Decimal | None = None
    checked_out_longitude: Decimal | None = None
    # Attendance sweep stamps (SPEC_NOSHOW §A/§B): when each nudge/alert went
    # out — null means not yet due, or never sent. Read-only diagnostics for
    # the coordinator surface; the sweep writes them.
    checkin_reminder_sent_at: datetime | None = None
    checkout_reminder_sent_at: datetime | None = None
    no_show_alerted_at: datetime | None = None
    # Derived on the model — checked_out_at − checked_in_at, never stored.
    worked_hours: float | None = None
    # Derived on the model from the stamps + the clock (app.core.attendance):
    # upcoming / due / on_shift / unclosed / completed / missed, null once
    # cancelled or released. What the worker history, tracking page and the
    # coordinator card show instead of a forever-"confirmed" status.
    attendance: str | None = None
    hours_adjusted_by_user_id: UUID | None = None
    hours_adjusted_at: datetime | None = None
    hours_adjustment_reason: str | None = None
    notes: str | None = None


class AssignmentCreate(BaseModel):
    staffing_request_id: UUID
    worker_user_id: UUID
    # Accepted for wire compatibility but IGNORED: the endpoint always sets
    # the authenticated caller. Clients should stop sending it.
    assigned_by_user_id: UUID | None = None
    notes: str | None = None


class AssignmentCancel(BaseModel):
    reason: str
    notes: str | None = None


class AssignmentCheckIn(BaseModel):
    latitude: Decimal | None = None
    longitude: Decimal | None = None


class AssignmentTimesPatch(BaseModel):
    """Coordinator time correction (SPEC_CHECKOUT_HOURS §5). Omitted fields
    stay untouched; reason is mandatory."""
    checked_in_at: datetime | None = None
    checked_out_at: datetime | None = None
    reason: str = Field(min_length=1)
