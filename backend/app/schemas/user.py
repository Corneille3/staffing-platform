from uuid import UUID

from pydantic import BaseModel, EmailStr

from app.models.enums import UserRole
from app.schemas.common import NormalizedPhone, TimestampedSchema


class UserBase(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    phone: str | None = None
    role: UserRole
    preferred_language: str = 'fr'
    is_active: bool = True


class UserRead(UserBase, TimestampedSchema):
    id: UUID
    clerk_user_id: str | None = None
    # true = don't text this number. Exposed so a person can see and flip
    # their own SMS preference (coordinator "My profile" card, worker Alertes).
    sms_opt_out: bool = False


class SyncedUserRead(UserRead):
    """/auth/sync response — UserRead + the tier-0 operator role so the
    frontend can hide owner/operator-only controls from `support`.
    None for everyone who isn't a platform operator."""
    platform_operator_role: str | None = None


class MyProfileUpdate(BaseModel):
    """PATCH /auth/profile — the fields a signed-in person may change about
    themselves. Both optional: a field left out is untouched; ``phone`` sent
    as "" or null clears the number (NormalizedPhone maps empty → None).
    Motivation: coordinators only got a phone at invite time, so the no-show
    SMS (attendance sweep reads ``User.phone`` + ``sms_opt_out``) could never
    reach anyone invited without one (prod round finding #3)."""

    phone: NormalizedPhone = None
    sms_opt_out: bool | None = None
