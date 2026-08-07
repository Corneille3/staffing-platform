from __future__ import annotations

from datetime import date, time, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.core.timeutil import shift_end_utc, shift_start_utc
from app.models.assignment import Assignment
from app.models.enums import AssignmentStatus
from app.models.organization import Organization
from app.models.staffing_request import StaffingRequest

# Statuses that mean "this worker is committed to being somewhere" — the ones the
# double-booking guard must respect. CANCELLED / RELEASED / COMPLETED free the slot.
ACTIVE_ASSIGNMENT_STATUSES = (
    AssignmentStatus.PENDING_CONFIRMATION,
    AssignmentStatus.CONFIRMED,
)


class AssignmentRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list(self) -> list[Assignment]:
        return list(self.db.scalars(select(Assignment).order_by(Assignment.assigned_at.desc())).all())

    def list_for_scope(self, scope: AccessScope) -> list[Assignment]:
        stmt = select(Assignment).order_by(Assignment.assigned_at.desc())
        if scope.is_platform_admin or scope.is_network_admin:
            if not scope.tenant_id:
                return []
            tenant_org_ids = select(Organization.id).where(Organization.tenant_id == scope.tenant_id)
            stmt = stmt.join(
                StaffingRequest, Assignment.staffing_request_id == StaffingRequest.id
            ).where(StaffingRequest.organization_id.in_(tenant_org_ids))
            return list(self.db.scalars(stmt).all())
        if scope.is_org_admin:
            if not scope.org_ids:
                return []
            stmt = stmt.join(
                StaffingRequest, Assignment.staffing_request_id == StaffingRequest.id
            ).where(StaffingRequest.organization_id.in_(scope.org_ids))
            return list(self.db.scalars(stmt).all())
        # Worker: only their own assignments.
        stmt = stmt.where(Assignment.worker_user_id == scope.user.id)
        return list(self.db.scalars(stmt).all())

    def get_by_request(self, request_id):
        # The LIVE assignment for a request. CANCELLED and RELEASED are both
        # dead: RELEASED means the giver handed the shift off via self-serve
        # replacement, so their row must not surface as the current assignee
        # on the original request (Finding #1, hand-off truth).
        stmt = select(Assignment).where(
            Assignment.staffing_request_id == request_id,
            Assignment.status.notin_((AssignmentStatus.CANCELLED, AssignmentStatus.RELEASED)),
        )
        return self.db.scalar(stmt)

    def get(self, assignment_id):
        stmt = select(Assignment).where(Assignment.id == assignment_id)
        return self.db.scalar(stmt)

    def create(self, assignment: Assignment) -> Assignment:
        self.db.add(assignment)
        self.db.flush()
        self.db.refresh(assignment)
        return assignment

    def overlapping_active_for_worker(
        self,
        worker_user_id: UUID,
        work_date: date,
        start_time: time,
        end_time: time,
        exclude_request_id: UUID | None = None,
    ) -> list[tuple[Assignment, StaffingRequest]]:
        """Active assignments whose shift overlaps the given window — the
        double-booking check behind assign/claim and the 'Already booked'
        eligibility reason.

        Deliberately unscoped: one human can't be in two places at once, so
        this looks across tenant/org boundaries (every other query in this
        repo is scope-filtered). ``exclude_request_id`` skips the request
        being evaluated itself, keeping idempotent re-checks sane.

        Midnight-crossing shifts (end_time <= start_time, the timeutil
        convention) are handled by fetching a ±1-day date window and
        comparing real datetimes; touching endpoints (8–12 then 12–16)
        do not conflict.
        """
        stmt = (
            select(Assignment, StaffingRequest)
            .join(StaffingRequest, Assignment.staffing_request_id == StaffingRequest.id)
            .where(
                Assignment.worker_user_id == worker_user_id,
                Assignment.status.in_(ACTIVE_ASSIGNMENT_STATUSES),
                StaffingRequest.work_date.between(
                    work_date - timedelta(days=1), work_date + timedelta(days=1)
                ),
            )
        )
        if exclude_request_id is not None:
            stmt = stmt.where(StaffingRequest.id != exclude_request_id)

        start = shift_start_utc(work_date, start_time)
        end = shift_end_utc(work_date, start_time, end_time)
        conflicts: list[tuple[Assignment, StaffingRequest]] = []
        for assignment, request in self.db.execute(stmt):
            other_start = shift_start_utc(request.work_date, request.start_time)
            other_end = shift_end_utc(request.work_date, request.start_time, request.end_time)
            if start < other_end and other_start < end:
                conflicts.append((assignment, request))
        return conflicts
