from datetime import date, datetime, time
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import CoverageType, OrganizationType, RequestRole, RequestStatus, RequestType
from app.schemas.common import TimestampedSchema


class OrganizationSummary(BaseModel):
    id: UUID
    name: str
    type: OrganizationType
    city: str
    neighbourhood: str | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None

    model_config = {'from_attributes': True}


class StaffingRequestBase(BaseModel):
    organization_id: UUID
    # created_by_user_id is server-derived from the authenticated caller
    # (StaffingRequestService overrides whatever the client sends with
    # scope.user.id). Optional here so the create payload can omit it; the
    # read response always carries the real creator from the DB.
    created_by_user_id: UUID | None = None
    request_type: RequestType
    role: RequestRole | None = None
    title: str
    description: str | None = None
    city: str
    location_name: str | None = None
    work_date: date
    start_time: time
    end_time: time
    urgency_level: int = 1
    language_requirement: str | None = 'fr'
    coverage_type: CoverageType | None = None
    hourly_rate: Decimal | None = None
    contact_name: str | None = None
    contact_phone: str | None = None
    contact_email: str | None = None
    arrival_instructions: str | None = None
    required_qualifications: list[dict] | list[str] = Field(default_factory=list)
    required_certifications: list[dict] | list[str] = Field(default_factory=list)


class StaffingRequestCreate(StaffingRequestBase):
    pass


class StaffingRequestDraftUpdate(BaseModel):
    """Partial update for an autosaved draft. Every field is optional so the
    coordinator UI can PATCH a single field on each keystroke without resending
    the whole form. ``status`` is intentionally not patchable here — promotion
    out of draft happens through the publish endpoint."""
    title: str | None = None
    description: str | None = None
    city: str | None = None
    location_name: str | None = None
    work_date: date | None = None
    start_time: time | None = None
    end_time: time | None = None
    urgency_level: int | None = None
    language_requirement: str | None = None
    coverage_type: CoverageType | None = None
    role: RequestRole | None = None
    hourly_rate: Decimal | None = None
    contact_name: str | None = None
    contact_phone: str | None = None
    contact_email: str | None = None
    arrival_instructions: str | None = None
    required_qualifications: list[dict] | list[str] | None = None
    required_certifications: list[dict] | list[str] | None = None


class StaffingRequestStatusUpdate(BaseModel):
    status: RequestStatus


class StaffingRequestRead(StaffingRequestBase, TimestampedSchema):
    id: UUID
    status: RequestStatus
    assigned_worker_user_id: UUID | None = None
    assigned_at: datetime | None = None
    cancelled_at: datetime | None = None
    completed_at: datetime | None = None
    organization: OrganizationSummary | None = None
