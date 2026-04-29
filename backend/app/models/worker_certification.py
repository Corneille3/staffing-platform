from datetime import date, datetime
from uuid import UUID

from sqlalchemy import Date, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class WorkerCertification(Base):
    __tablename__ = 'worker_certifications'
    __table_args__ = (UniqueConstraint('worker_profile_id', 'certification_code', name='uq_worker_certification_profile_code'),)

    id: Mapped[UUID] = mapped_column(primary_key=True)
    worker_profile_id: Mapped[UUID] = mapped_column(ForeignKey('worker_profiles.id', ondelete='CASCADE'))
    certification_code: Mapped[str] = mapped_column(String(100))
    certification_label: Mapped[str | None] = mapped_column(String(255))
    expires_at: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    worker_profile = relationship('WorkerProfile', back_populates='certification_records')
