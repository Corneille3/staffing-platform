from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.models.enums import ResponseStatus
from app.schemas.common import TimestampedSchema


class RequestResponseRead(TimestampedSchema):
    id: UUID
    staffing_request_id: UUID
    worker_user_id: UUID
    status: ResponseStatus
    decline_reason: str | None = None
    viewed_at: datetime | None = None
    last_reviewed_at: datetime | None = None
    responded_at: datetime | None = None


class RequestResponseUpdate(BaseModel):
    status: ResponseStatus


class RequestResponseAction(BaseModel):
    worker_user_id: UUID
    decline_reason: str | None = None
