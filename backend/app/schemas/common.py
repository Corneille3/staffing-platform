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


def _normalize_phone(value):
    """Store phones in E.164 so an inbound SMS can be matched to a person.

    Same reasoning as the email normalization above: Twilio hands us
    `+15145550001` while a coordinator types `(514) 555-0001`, and a reply that
    matches nobody silently loses the worker's claim. Migration 0022 backfilled
    existing rows; this keeps new ones canonical. Unparseable input passes
    through untouched rather than being mangled.
    """
    if not isinstance(value, str):
        return value
    from app.core.phone import normalize_e164

    return normalize_e164(value)


NormalizedPhone = Annotated[str | None, BeforeValidator(_normalize_phone)]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class TimestampedSchema(ORMModel):
    created_at: datetime
    updated_at: datetime | None = None


class ListResponse(BaseModel):
    items: list


class UUIDResource(ORMModel):
    id: UUID
