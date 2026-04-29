from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.staffing_request import StaffingRequest


class StaffingRequestRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list(self) -> list[StaffingRequest]:
        stmt = (
            select(StaffingRequest)
            .options(selectinload(StaffingRequest.requirements))
            .order_by(StaffingRequest.work_date, StaffingRequest.start_time)
        )
        return list(self.db.scalars(stmt).all())

    def get(self, request_id: UUID) -> StaffingRequest | None:
        stmt = select(StaffingRequest).where(StaffingRequest.id == request_id).options(selectinload(StaffingRequest.requirements))
        return self.db.scalar(stmt)

    def create(self, staffing_request: StaffingRequest) -> StaffingRequest:
        self.db.add(staffing_request)
        self.db.flush()
        self.db.refresh(staffing_request)
        return staffing_request

    def save(self, staffing_request: StaffingRequest) -> StaffingRequest:
        self.db.add(staffing_request)
        self.db.flush()
        self.db.refresh(staffing_request)
        return staffing_request
