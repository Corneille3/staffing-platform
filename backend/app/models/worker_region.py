from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class WorkerRegion(Base):
    __tablename__ = 'worker_regions'
    __table_args__ = (UniqueConstraint('worker_profile_id', 'city', 'region', name='uq_worker_region_profile_city_region'),)

    id: Mapped[UUID] = mapped_column(primary_key=True)
    worker_profile_id: Mapped[UUID] = mapped_column(ForeignKey('worker_profiles.id', ondelete='CASCADE'))
    city: Mapped[str] = mapped_column(String(100))
    region: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    worker_profile = relationship('WorkerProfile', back_populates='region_records')
