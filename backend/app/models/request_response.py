from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import ResponseStatus, db_enum


class RequestResponse(Base):
    __tablename__ = 'request_responses'
    __table_args__ = (UniqueConstraint('staffing_request_id', 'worker_user_id', name='uq_request_response_request_worker'),)

    id: Mapped[UUID] = mapped_column(primary_key=True)
    staffing_request_id: Mapped[UUID] = mapped_column(ForeignKey('staffing_requests.id', ondelete='CASCADE'))
    worker_user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    status: Mapped[ResponseStatus] = mapped_column(db_enum(ResponseStatus, 'response_status'))
    decline_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    staffing_request = relationship('StaffingRequest', back_populates='responses')
