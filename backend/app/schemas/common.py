from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, BeforeValidator, ConfigDict, EmailStr


def _normalize_email(value):
    """Lowercase + strip so an invite and its later sign-in resolve to the same
    identity (Clerk lowercases sign-in emails; phones autocapitalize). Applied
    at the schema boundary so both the existence lookup and the stored row use
    the canonical form. Non-str passes through for Pydantic to reject."""
    return value.strip().lower() if isinstance(value, str) else value


# Format-validated (EmailStr) + normalized — for invite payloads.
NormalizedEmail = Annotated[EmailStr, BeforeValidator(_normalize_email)]
# Normalized without tightening format validation — for fields historically
# typed as bare `str` (avoids a validation-behavior regression).
NormalizedEmailLoose = Annotated[str, BeforeValidator(_normalize_email)]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class TimestampedSchema(ORMModel):
    created_at: datetime
    updated_at: datetime | None = None


class ListResponse(BaseModel):
    items: list


class UUIDResource(ORMModel):
    id: UUID
