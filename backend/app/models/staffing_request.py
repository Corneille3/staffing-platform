from datetime import date, datetime, time
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, Time, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import (
    CoverageType,
    RequestOrigin,
    RequestRequirementType,
    RequestRole,
    RequestStatus,
    RequestType,
    db_enum,
)


class StaffingRequest(Base):
    __tablename__ = 'staffing_requests'

    id: Mapped[UUID] = mapped_column(primary_key=True)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey('organizations.id', ondelete='RESTRICT'))
    created_by_user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    request_type: Mapped[RequestType] = mapped_column(db_enum(RequestType, 'request_type'))
    role: Mapped[RequestRole | None] = mapped_column(db_enum(RequestRole, 'request_role'))
    hourly_rate: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    status: Mapped[RequestStatus] = mapped_column(
        db_enum(RequestStatus, 'request_status'),
        default=RequestStatus.DRAFT,
        server_default=RequestStatus.DRAFT.value,
    )
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str] = mapped_column(String(100))
    location_name: Mapped[str | None] = mapped_column(String(255))
    work_date: Mapped[date] = mapped_column(Date)
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
    urgency_level: Mapped[int] = mapped_column(Integer, default=1, server_default='1')
    language_requirement: Mapped[str | None] = mapped_column(String(20), default='fr', server_default='fr')
    coverage_type: Mapped[CoverageType | None] = mapped_column(db_enum(CoverageType, 'coverage_type'))
    contact_name: Mapped[str | None] = mapped_column(String(255))
    contact_phone: Mapped[str | None] = mapped_column(String(50))
    contact_email: Mapped[str | None] = mapped_column(String(255))
    arrival_instructions: Mapped[str | None] = mapped_column(Text)
    # Self-serve replacement (SELF_SERVE_REPLACEMENT §1). origin defaults to
    # coordinator so every existing request is unchanged; auto_assign short-
    # circuits the coordinator confirm (the claim IS the assignment).
    origin: Mapped[RequestOrigin] = mapped_column(
        db_enum(RequestOrigin, 'request_origin'),
        default=RequestOrigin.COORDINATOR,
        server_default=RequestOrigin.COORDINATOR.value,
    )
    auto_assign: Mapped[bool] = mapped_column(Boolean, default=False, server_default='false')
    # The assignment being released (worker_replacement only); NULL for a
    # staff_absence report, which has no StaffiG assignment to release.
    replaces_assignment_id: Mapped[UUID | None] = mapped_column(
        ForeignKey('assignments.id', ondelete='SET NULL')
    )
    release_reason: Mapped[str | None] = mapped_column(String(20))  # sick|family|personal|other
    assigned_worker_user_id: Mapped[UUID | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'))
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Stamped when a coordinator edits real content on an already-published
    # request (see StaffingRequestService.update_draft). Drives the worker-side
    # "task was modified — please review" banner.
    content_last_edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    organization = relationship('Organization', back_populates='staffing_requests')
    notifications = relationship('RequestNotification', back_populates='staffing_request')
    responses = relationship('RequestResponse', back_populates='staffing_request')
    # foreign_keys pinned to the original FK: replaces_assignment_id added a
    # second staffing_requests<->assignments path that SQLAlchemy can't auto-resolve.
    assignment = relationship(
        'Assignment', back_populates='staffing_request', uselist=False,
        foreign_keys='Assignment.staffing_request_id',
    )
    requirements = relationship('RequestRequirement', back_populates='staffing_request', cascade='all, delete-orphan')

    @property
    def required_qualifications(self) -> list[str]:
        return [
            requirement.requirement_code
            for requirement in self.requirements
            if requirement.requirement_type == RequestRequirementType.QUALIFICATION
        ]

    @property
    def required_certifications(self) -> list[str]:
        return [
            requirement.requirement_code
            for requirement in self.requirements
            if requirement.requirement_type == RequestRequirementType.CERTIFICATION
        ]
