from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Numeric, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import AssignmentStatus, db_enum


class Assignment(Base):
    __tablename__ = 'assignments'

    id: Mapped[UUID] = mapped_column(primary_key=True)
    staffing_request_id: Mapped[UUID] = mapped_column(ForeignKey('staffing_requests.id', ondelete='CASCADE'))
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
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    checked_in_latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    checked_in_longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    checked_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    checked_out_latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    checked_out_longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    # Coordinator time correction (SPEC_CHECKOUT_HOURS §5) — who touched the
    # payroll numbers, when, and why. The UI must never present a corrected
    # time as if the worker recorded it.
    hours_adjusted_by_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey('users.id', ondelete='SET NULL')
    )
    hours_adjusted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    hours_adjustment_reason: Mapped[str | None] = mapped_column(Text)
    # Attendance reminder/alert idempotence (SPEC_NOSHOW): the sweep repasses
    # every tick — a stamp means "already fired", and doubles as audit.
    checkin_reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    checkout_reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    no_show_alerted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)

    @property
    def worked_hours(self) -> float | None:
        """Derived, never stored — recomputes correctly after a correction."""
        if self.checked_in_at is None or self.checked_out_at is None:
            return None
        return round((self.checked_out_at - self.checked_in_at).total_seconds() / 3600, 2)

    @property
    def attendance(self) -> str | None:
        """Derived presence state (see app.core.attendance) — upcoming / due /
        on_shift / unclosed / completed / missed, None once cancelled or
        released. Read by every surface instead of guessing from `status`."""
        from app.core.attendance import attendance_state

        return attendance_state(self, datetime.now(timezone.utc))

    # foreign_keys pinned: staffing_requests.replaces_assignment_id adds a second
    # path between the tables, so the join column must be stated explicitly.
    staffing_request = relationship(
        'StaffingRequest', back_populates='assignment',
        foreign_keys=[staffing_request_id],
    )
