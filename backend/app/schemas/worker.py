from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import AvailabilityStatus
from app.schemas.common import TimestampedSchema


class WorkerProfileBase(BaseModel):
    availability_status: AvailabilityStatus = AvailabilityStatus.AVAILABLE
    urgent_alert_opt_in: bool = True
    travel_radius_km: int | None = None
    qualifications: list[dict] | list[str] = Field(default_factory=list)
    certifications: list[dict] | list[str] = Field(default_factory=list)
    supported_cities: list[str] = Field(default_factory=list)
    notes: str | None = None


class WorkerProfileRead(WorkerProfileBase, TimestampedSchema):
    id: UUID
    user_id: UUID


class WorkerRead(BaseModel):
    id: UUID
    cognito_sub: str | None = None
    first_name: str
    last_name: str
    email: EmailStr
    phone: str | None = None
    preferred_language: str
    is_active: bool
    profile: WorkerProfileRead | None = None


class WorkerAvailabilityUpdate(BaseModel):
    availability_status: AvailabilityStatus
