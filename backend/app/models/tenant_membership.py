from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import EmploymentType, UserRole, db_enum


class TenantMembership(Base):
    __tablename__ = 'tenant_memberships'

    id: Mapped[UUID] = mapped_column(primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey('tenants.id', ondelete='CASCADE'))
    role: Mapped[UserRole] = mapped_column(db_enum(UserRole, 'user_role'))
    # Worker's relationship to the tenant, set by the tenant admin at invite
    # (SELF_SERVE_REPLACEMENT §1). Drives the self-serve trigger (report vs
    # release). Default contractor keeps existing members on the release path.
    employment_type: Mapped[EmploymentType] = mapped_column(
        db_enum(EmploymentType, 'employment_type'),
        default=EmploymentType.CONTRACTOR,
        server_default=EmploymentType.CONTRACTOR.value,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default='true')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tenant = relationship('Tenant', back_populates='memberships')
    user = relationship('User')
