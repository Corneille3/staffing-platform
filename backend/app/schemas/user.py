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
    cognito_sub: str | None = None
