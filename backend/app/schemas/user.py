from uuid import UUID

from pydantic import BaseModel, EmailStr

from app.models.enums import UserRole
from app.schemas.common import TimestampedSchema


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


class SyncedUserRead(UserRead):
    """/auth/sync response — UserRead + the tier-0 operator role so the
    frontend can hide owner/operator-only controls from `support`.
    None for everyone who isn't a platform operator."""
    platform_operator_role: str | None = None
