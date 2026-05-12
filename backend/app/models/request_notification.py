from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import NotificationChannel, db_enum


class RequestNotification(Base):
    __tablename__ = 'request_notifications'

    id: Mapped[UUID] = mapped_column(primary_key=True)
    staffing_request_id: Mapped[UUID] = mapped_column(ForeignKey('staffing_requests.id', ondelete='CASCADE'))
    worker_user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    channel: Mapped[NotificationChannel] = mapped_column(db_enum(NotificationChannel, 'notification_channel'))
    delivery_status: Mapped[str] = mapped_column(String(50), default='queued', server_default='queued')
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    match_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    staffing_request = relationship('StaffingRequest', back_populates='notifications')
