from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import UserRole, db_enum


class OrganizationMembership(Base):
    __tablename__ = 'organization_memberships'
    __table_args__ = (UniqueConstraint('user_id', 'organization_id', name='uq_user_organization_membership'),)

    id: Mapped[UUID] = mapped_column(primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    organization_id: Mapped[UUID] = mapped_column(ForeignKey('organizations.id', ondelete='CASCADE'))
    role: Mapped[UserRole] = mapped_column(db_enum(UserRole, 'user_role'))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default='true')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user = relationship('User', back_populates='memberships')
    organization = relationship('Organization', back_populates='memberships')
