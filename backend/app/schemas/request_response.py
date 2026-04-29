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
    responded_at: datetime | None = None


class RequestResponseUpdate(BaseModel):
    status: ResponseStatus


class RequestResponseAction(BaseModel):
    worker_user_id: UUID
