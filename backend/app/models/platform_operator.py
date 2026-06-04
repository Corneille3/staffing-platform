from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import PlatformOperatorRole, db_enum


class PlatformOperator(Base):
    """A tier-0 StaffiG operator (PLATFORM_HANDOFF §1). One row per platform
    operator, layered on a user who also has UserRole.PLATFORM_ADMIN (the
    surface gate). `role` adds the owner/operator/support granularity."""

    __tablename__ = 'platform_operators'

    id: Mapped[UUID] = mapped_column(primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), unique=True)
    role: Mapped[PlatformOperatorRole] = mapped_column(
        db_enum(PlatformOperatorRole, 'platform_operator_role'),
        default=PlatformOperatorRole.OPERATOR, server_default='operator',
    )
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default='false')
    invited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_active_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
