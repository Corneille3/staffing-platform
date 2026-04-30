from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.auth.scope import AccessScope
from app.models.request_response import RequestResponse
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

    def list_for_scope(self, scope: AccessScope) -> list[StaffingRequest]:
        stmt = (
            select(StaffingRequest)
            .options(selectinload(StaffingRequest.requirements))
            .order_by(StaffingRequest.work_date, StaffingRequest.start_time)
        )
        if scope.is_apf:
            return list(self.db.scalars(stmt).all())
        if scope.is_org_admin:
            if not scope.org_ids:
                return []
            stmt = stmt.where(StaffingRequest.organization_id.in_(scope.org_ids))
            return list(self.db.scalars(stmt).all())
        # Worker: requests they have a response row for (i.e. were notified).
        stmt = stmt.join(
            RequestResponse,
            RequestResponse.staffing_request_id == StaffingRequest.id,
        ).where(RequestResponse.worker_user_id == scope.user.id)
        return list(self.db.scalars(stmt).all())

    def get(self, request_id: UUID) -> StaffingRequest | None:
        stmt = (
            select(StaffingRequest)
            .where(StaffingRequest.id == request_id)
            .options(selectinload(StaffingRequest.requirements))
        )
        return self.db.scalar(stmt)

    def can_access(self, staffing_request: StaffingRequest, scope: AccessScope) -> bool:
        if scope.is_apf:
            return True
        if scope.is_org_admin:
            return staffing_request.organization_id in scope.org_ids
        # Worker
        own_response = self.db.scalar(
            select(RequestResponse).where(
                RequestResponse.staffing_request_id == staffing_request.id,
                RequestResponse.worker_user_id == scope.user.id,
            )
        )
        return own_response is not None

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
