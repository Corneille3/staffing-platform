from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.models.enums import AvailabilityStatus
from app.schemas.common import TimestampedSchema


class WorkerProfileBase(BaseModel):
    availability_status: AvailabilityStatus = AvailabilityStatus.AVAILABLE
    urgent_alert_opt_in: bool = True
    notify_far: bool = False
    notify_weekend_overnight: bool = False
    travel_radius_km: int | None = None
    home_latitude: Decimal | None = None
    home_longitude: Decimal | None = None
    qualifications: list[dict] | list[str] = Field(default_factory=list)
    certifications: list[dict] | list[str] = Field(default_factory=list)
    supported_cities: list[str] = Field(default_factory=list)
    notes: str | None = None


class WorkerProfileRead(WorkerProfileBase, TimestampedSchema):
    id: UUID
    user_id: UUID


class WorkerRead(BaseModel):
    id: UUID
    clerk_user_id: str | None = None
    first_name: str
    last_name: str
    email: EmailStr
    phone: str | None = None
    preferred_language: str
    is_active: bool
    profile: WorkerProfileRead | None = None


class WorkerAvailabilityUpdate(BaseModel):
    availability_status: AvailabilityStatus | None = None
    urgent_alert_opt_in: bool | None = None
    notify_far: bool | None = None
    notify_weekend_overnight: bool | None = None
    supported_cities: list[str] | None = None

    @model_validator(mode='after')
    def require_at_least_one_change(self):
        if (
            self.availability_status is None
            and self.urgent_alert_opt_in is None
            and self.notify_far is None
            and self.notify_weekend_overnight is None
            and self.supported_cities is None
        ):
            raise ValueError('At least one worker preference must be provided.')
        return self


class WorkerInviteCreate(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    phone: str | None = None
    preferred_language: str = 'fr'


class WorkerOnboardCreate(BaseModel):
    availability_status: AvailabilityStatus = AvailabilityStatus.AVAILABLE
    urgent_alert_opt_in: bool = True
    supported_cities: list[str] = Field(default_factory=list)
    qualifications: list[str] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
