from datetime import date, datetime, time
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import CoverageType, RequestStatus, RequestType
from app.schemas.common import TimestampedSchema


class StaffingRequestBase(BaseModel):
    organization_id: UUID
    created_by_user_id: UUID
    request_type: RequestType
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
    contact_name: str | None = None
    contact_phone: str | None = None
    contact_email: str | None = None
    arrival_instructions: str | None = None
    required_qualifications: list[dict] | list[str] = Field(default_factory=list)
    required_certifications: list[dict] | list[str] = Field(default_factory=list)


class StaffingRequestCreate(StaffingRequestBase):
    pass


class StaffingRequestStatusUpdate(BaseModel):
    status: RequestStatus


class StaffingRequestRead(StaffingRequestBase, TimestampedSchema):
    id: UUID
    status: RequestStatus
    assigned_worker_user_id: UUID | None = None
    assigned_at: datetime | None = None
    cancelled_at: datetime | None = None
    completed_at: datetime | None = None
