from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import UserRole, db_enum


class User(Base):
    __tablename__ = 'users'

    id: Mapped[UUID] = mapped_column(primary_key=True)
    clerk_user_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    phone: Mapped[str | None] = mapped_column(String(50))
    role: Mapped[UserRole] = mapped_column(db_enum(UserRole, 'user_role'))
    preferred_language: Mapped[str] = mapped_column(String(20), default='fr', server_default='fr')
    # Negative on purpose: false = texts allowed, so existing rows need no
    # backfill and an inbound STOP/ARRET is the thing that flips it. Sits
    # beside `phone` because it governs that number, not a matching
    # preference — the other notify_* toggles live on worker_profiles.
    sms_opt_out: Mapped[bool] = mapped_column(Boolean, default=False, server_default='false')
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default='true')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    worker_profile = relationship('WorkerProfile', back_populates='user', uselist=False)
    memberships = relationship('OrganizationMembership', back_populates='user')
    availabilities = relationship('Availability', back_populates='user', cascade='all, delete-orphan')
