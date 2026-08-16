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
    # Derived on the model — checked_out_at − checked_in_at, never stored.
    worked_hours: float | None = None
    hours_adjusted_by_user_id: UUID | None = None
    hours_adjusted_at: datetime | None = None
    hours_adjustment_reason: str | None = None
    notes: str | None = None


class AssignmentCreate(BaseModel):
    staffing_request_id: UUID
    worker_user_id: UUID
    # Optional — when omitted, the endpoint derives it from the authenticated
    # caller (the assigner is always the caller).
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
