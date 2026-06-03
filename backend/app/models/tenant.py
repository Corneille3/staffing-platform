from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import TenantStatus, db_enum


class Tenant(Base):
    __tablename__ = 'tenants'

    id: Mapped[UUID] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    # Lifecycle (MULTITENANCY_HANDOFF §4). `is_active` stays as the soft-delete /
    # removal flag; `status` tracks the onboarding lifecycle. Defaults to ACTIVE
    # so directly-seeded tenants are live; the platform invite flow sets PENDING.
    status: Mapped[TenantStatus] = mapped_column(
        db_enum(TenantStatus, 'tenant_status'),
        default=TenantStatus.ACTIVE, server_default='active',
    )
    region: Mapped[str | None] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default='true')
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    organizations = relationship('Organization', back_populates='tenant')
    memberships = relationship('TenantMembership', back_populates='tenant')
