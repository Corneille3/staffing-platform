from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.models.assignment import Assignment
from app.models.organization import Organization
from app.models.staffing_request import StaffingRequest


class ReportingService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def network_summary(self, scope: AccessScope) -> dict[str, int]:
        # APF sees the full network. Org admins see counts limited to their
        # organizations. Workers shouldn't reach this endpoint (the route
        # gate stops them) but if they did it would return zeroes.
        org_count_stmt = select(func.count()).select_from(Organization)
        request_stmt = select(func.count()).select_from(StaffingRequest)
        assignment_stmt = (
            select(func.count())
            .select_from(Assignment)
            .join(StaffingRequest, Assignment.staffing_request_id == StaffingRequest.id)
        )

        if not scope.is_apf:
            if not scope.org_ids:
                return {'organization_count': 0, 'request_count': 0, 'assignment_count': 0}
            org_count_stmt = org_count_stmt.where(Organization.id.in_(scope.org_ids))
            request_stmt = request_stmt.where(StaffingRequest.organization_id.in_(scope.org_ids))
            assignment_stmt = assignment_stmt.where(
                StaffingRequest.organization_id.in_(scope.org_ids)
            )

        return {
            'organization_count': self.db.scalar(org_count_stmt) or 0,
            'request_count': self.db.scalar(request_stmt) or 0,
            'assignment_count': self.db.scalar(assignment_stmt) or 0,
        }

    def organization_summary(self, organization_id: UUID, scope: AccessScope) -> dict[str, int]:
        if not scope.is_apf and organization_id not in scope.org_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail='You do not have access to this organization.',
            )
        return {
            'request_count': self.db.scalar(
                select(func.count())
                .select_from(StaffingRequest)
                .where(StaffingRequest.organization_id == organization_id)
            )
            or 0,
            'assignment_count': self.db.scalar(
                select(func.count())
                .select_from(Assignment)
                .join(StaffingRequest, Assignment.staffing_request_id == StaffingRequest.id)
                .where(StaffingRequest.organization_id == organization_id)
            )
            or 0,
        }
