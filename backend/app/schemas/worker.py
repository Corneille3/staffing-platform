from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.models.enums import AvailabilityStatus, EmploymentType
from app.schemas.common import NormalizedEmail, NormalizedPhone, TimestampedSchema


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
    # true = don't text this worker (own toggle, or an inbound STOP/ARRET).
    # Lives on the user row beside `phone`, not on `profile`.
    sms_opt_out: bool = False
    is_active: bool
    # Drives which self-serve trigger the worker app shows (SELF_SERVE §1):
    # contractor → release held shifts; permanent → report absences.
    employment_type: EmploymentType = EmploymentType.CONTRACTOR
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


class WorkerSmsPreferenceUpdate(BaseModel):
    """Separate from WorkerAvailabilityUpdate on purpose: that endpoint writes
    profile columns and 404s when no profile exists, while this flag lives on
    the user row and must stay settable for anyone with a phone."""

    sms_opt_out: bool


class WorkerInviteCreate(BaseModel):
    first_name: str
    last_name: str
    email: NormalizedEmail
    phone: NormalizedPhone = None
    preferred_language: str = 'fr'
    # Self-serve replacement (§1): the tenant admin sets the worker's
    # relationship at invite. Default contractor → the release path.
    employment_type: EmploymentType = EmploymentType.CONTRACTOR


class WorkerOnboardCreate(BaseModel):
    availability_status: AvailabilityStatus = AvailabilityStatus.AVAILABLE
    urgent_alert_opt_in: bool = True
    supported_cities: list[str] = Field(default_factory=list)
    qualifications: list[str] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    preferred_language: str | None = None  # fr | en | bilingual


class WorkerOrganizationOption(BaseModel):
    """One org the worker could opt into, with their current choice."""
    organization_id: UUID
    name: str
    city: str
    selected: bool


class WorkerOrganizationsRead(BaseModel):
    items: list[WorkerOrganizationOption]
    # False = no active selection rows → worker is open to every org
    # (the opt-out default). True = the matching gate is restricting.
    restricted: bool


class WorkerOrganizationsUpdate(BaseModel):
    # Full replacement of the selection set. Empty list = back to
    # "open to all orgs".
    organization_ids: list[UUID] = Field(default_factory=list)
