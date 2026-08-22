from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class WorkerOrganization(Base):
    """A worker's opt-in to work for one organization within their tenant.

    Deliberately NOT an OrganizationMembership row — several admin queries
    (coordinator listings, org drill-ins) treat any active membership as a
    coordinator without filtering by role. Absence of rows for a worker
    means "open to all orgs" (the backward-compatible opt-out model);
    the matching gate only restricts once at least one active row exists.
    """
    __tablename__ = 'worker_organizations'
    __table_args__ = (UniqueConstraint('user_id', 'organization_id', name='uq_worker_organization'),)

    id: Mapped[UUID] = mapped_column(primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    organization_id: Mapped[UUID] = mapped_column(ForeignKey('organizations.id', ondelete='CASCADE'))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default='true')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user = relationship('User')
    organization = relationship('Organization')
