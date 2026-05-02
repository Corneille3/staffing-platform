from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel

from app.models.enums import NotificationChannel
from app.schemas.common import ORMModel


class NotificationRead(ORMModel):
    id: UUID
    staffing_request_id: UUID
    worker_user_id: UUID
    channel: NotificationChannel
    delivery_status: str
    sent_at: datetime | None = None
    delivered_at: datetime | None = None
    created_at: datetime


class NotificationFeedItem(BaseModel):
    id: str
    type: str  # new_request | urgent | assigned | not_selected | cancelled
    staffing_request_id: UUID
    request_title: str
    request_city: str
    request_date: date
    created_at: datetime
