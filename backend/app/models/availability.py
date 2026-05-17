from datetime import date as date_cls, datetime
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, SmallInteger, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import SlotPeriod, db_enum


class Availability(Base):
    """Per-day, per-slot worker availability.

    Either `day_of_week` (recurring) or `specific_date` (one-off) is set.
    """

    __tablename__ = 'availabilities'
    __table_args__ = (
        CheckConstraint(
            '(day_of_week IS NOT NULL) OR (specific_date IS NOT NULL)',
            name='ck_availabilities_recurring_or_specific',
        ),
        CheckConstraint(
            '(day_of_week IS NULL) OR (day_of_week BETWEEN 0 AND 6)',
            name='ck_availabilities_day_of_week_range',
        ),
        UniqueConstraint('user_id', 'day_of_week', 'slot', name='uq_availabilities_recurring'),
        UniqueConstraint('user_id', 'specific_date', 'slot', name='uq_availabilities_specific'),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    day_of_week: Mapped[int | None] = mapped_column(SmallInteger)
    specific_date: Mapped[date_cls | None] = mapped_column(Date)
    slot: Mapped[SlotPeriod] = mapped_column(db_enum(SlotPeriod, 'slot_period'))
    available: Mapped[bool] = mapped_column(Boolean, default=True, server_default='true')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user = relationship('User', back_populates='availabilities')
