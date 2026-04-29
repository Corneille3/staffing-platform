from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.assignment import Assignment
from app.models.organization import Organization
from app.models.staffing_request import StaffingRequest


class ReportingService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def network_summary(self) -> dict[str, int]:
        return {
            'organization_count': self.db.scalar(select(func.count()).select_from(Organization)) or 0,
            'request_count': self.db.scalar(select(func.count()).select_from(StaffingRequest)) or 0,
            'assignment_count': self.db.scalar(select(func.count()).select_from(Assignment)) or 0,
        }

    def organization_summary(self, organization_id) -> dict[str, int]:
        return {
            'request_count': self.db.scalar(
                select(func.count()).select_from(StaffingRequest).where(StaffingRequest.organization_id == organization_id)
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
