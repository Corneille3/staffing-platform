from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import RequestRequirementType, db_enum


class RequestRequirement(Base):
    __tablename__ = 'request_requirements'
    __table_args__ = (
        UniqueConstraint(
            'staffing_request_id',
            'requirement_type',
            'requirement_code',
            name='uq_request_requirement_request_type_code',
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    staffing_request_id: Mapped[UUID] = mapped_column(ForeignKey('staffing_requests.id', ondelete='CASCADE'))
    requirement_type: Mapped[RequestRequirementType] = mapped_column(
        db_enum(RequestRequirementType, 'request_requirement_type')
    )
    requirement_code: Mapped[str] = mapped_column(String(100))
    requirement_label: Mapped[str | None] = mapped_column(String(255))
    is_required: Mapped[bool] = mapped_column(Boolean, default=True, server_default='true')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    staffing_request = relationship('StaffingRequest', back_populates='requirements')
