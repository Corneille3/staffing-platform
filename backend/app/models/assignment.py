from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import AssignmentStatus, db_enum


class Assignment(Base):
    __tablename__ = 'assignments'

    id: Mapped[UUID] = mapped_column(primary_key=True)
    staffing_request_id: Mapped[UUID] = mapped_column(ForeignKey('staffing_requests.id', ondelete='CASCADE'), unique=True)
    worker_user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    assigned_by_user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    status: Mapped[AssignmentStatus] = mapped_column(
        db_enum(AssignmentStatus, 'assignment_status'),
        default=AssignmentStatus.PENDING_CONFIRMATION,
        server_default=AssignmentStatus.PENDING_CONFIRMATION.value,
    )
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)

    staffing_request = relationship('StaffingRequest', back_populates='assignment')
