from datetime import datetime
from uuid import UUID

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
