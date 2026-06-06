from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import TenantAccessGrantStatus, db_enum


class TenantAccessGrant(Base):
    """A logged, consented, time-boxed exception to the tier-0 privacy boundary
    (PLATFORM_HANDOFF §2.2). An operator asks to look inside ONE tenant with a
    reason; the tenant admin approves; access is read-only and auto-expires."""

    __tablename__ = 'tenant_access_grants'

    id: Mapped[UUID] = mapped_column(primary_key=True)
    operator_user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey('tenants.id', ondelete='CASCADE'))
    reason: Mapped[str] = mapped_column(String(500))
    status: Mapped[TenantAccessGrantStatus] = mapped_column(
        db_enum(TenantAccessGrantStatus, 'tenant_access_grant_status'),
        default=TenantAccessGrantStatus.REQUESTED, server_default='requested',
    )
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    approved_by_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey('users.id', ondelete='SET NULL')
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
