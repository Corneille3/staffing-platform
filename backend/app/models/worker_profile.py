from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import AvailabilityStatus, db_enum


class WorkerProfile(Base):
    __tablename__ = 'worker_profiles'

    id: Mapped[UUID] = mapped_column(primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), unique=True)
    availability_status: Mapped[AvailabilityStatus] = mapped_column(
        db_enum(AvailabilityStatus, 'availability_status'),
        default=AvailabilityStatus.AVAILABLE,
        server_default=AvailabilityStatus.AVAILABLE.value,
    )
    urgent_alert_opt_in: Mapped[bool] = mapped_column(Boolean, default=True, server_default='true')
    travel_radius_km: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship('User', back_populates='worker_profile')
    region_records = relationship('WorkerRegion', back_populates='worker_profile', cascade='all, delete-orphan')
    qualification_records = relationship('WorkerQualification', back_populates='worker_profile', cascade='all, delete-orphan')
    certification_records = relationship('WorkerCertification', back_populates='worker_profile', cascade='all, delete-orphan')

    @property
    def supported_cities(self) -> list[str]:
        return [record.city for record in self.region_records]

    @property
    def qualifications(self) -> list[str]:
        return [record.qualification_code for record in self.qualification_records]

    @property
    def certifications(self) -> list[str]:
        return [record.certification_code for record in self.certification_records]
