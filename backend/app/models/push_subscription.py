from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class PushSubscription(Base):
    """One browser/device push endpoint for a worker (Web Push / PWA).

    A user can hold several rows (phone + laptop). The endpoint URL is the
    natural key — re-subscribing the same browser upserts rather than
    duplicating. Rows are pruned when the push service reports the endpoint
    gone (404/410).
    """

    __tablename__ = 'push_subscriptions'

    id: Mapped[UUID] = mapped_column(primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    p256dh: Mapped[str] = mapped_column(String(255))
    auth: Mapped[str] = mapped_column(String(255))
    user_agent: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user = relationship('User')
