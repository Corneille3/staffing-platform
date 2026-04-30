from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.models.assignment import Assignment
from app.models.staffing_request import StaffingRequest


class AssignmentRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list(self) -> list[Assignment]:
        return list(self.db.scalars(select(Assignment).order_by(Assignment.assigned_at.desc())).all())

    def list_for_scope(self, scope: AccessScope) -> list[Assignment]:
        stmt = select(Assignment).order_by(Assignment.assigned_at.desc())
        if scope.is_apf:
            return list(self.db.scalars(stmt).all())
        if scope.is_org_admin:
            if not scope.org_ids:
                return []
            stmt = stmt.join(
                StaffingRequest, Assignment.staffing_request_id == StaffingRequest.id
            ).where(StaffingRequest.organization_id.in_(scope.org_ids))
            return list(self.db.scalars(stmt).all())
        # Worker: only assignments where they are the assignee.
        stmt = stmt.where(Assignment.worker_user_id == scope.user.id)
        return list(self.db.scalars(stmt).all())

    def get_by_request(self, request_id):
        stmt = select(Assignment).where(Assignment.staffing_request_id == request_id)
        return self.db.scalar(stmt)

    def create(self, assignment: Assignment) -> Assignment:
        self.db.add(assignment)
        self.db.flush()
        self.db.refresh(assignment)
        return assignment
