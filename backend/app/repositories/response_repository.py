from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.request_response import RequestResponse


class ResponseRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_for_request(self, request_id: UUID) -> list[RequestResponse]:
        stmt = (
            select(RequestResponse)
            .where(RequestResponse.staffing_request_id == request_id)
            .order_by(RequestResponse.created_at.desc())
        )
        return list(self.db.scalars(stmt).all())

    def list_for_worker(self, worker_user_id: UUID) -> list[RequestResponse]:
        stmt = (
            select(RequestResponse)
            .where(RequestResponse.worker_user_id == worker_user_id)
            .order_by(RequestResponse.created_at.desc())
        )
        return list(self.db.scalars(stmt).all())

    def get_for_request_and_worker(self, request_id: UUID, worker_user_id: UUID) -> RequestResponse | None:
        stmt = select(RequestResponse).where(
            RequestResponse.staffing_request_id == request_id,
            RequestResponse.worker_user_id == worker_user_id,
        )
        return self.db.scalar(stmt)

    def create(self, response: RequestResponse) -> RequestResponse:
        self.db.add(response)
        self.db.flush()
        self.db.refresh(response)
        return response

    def save(self, response: RequestResponse) -> RequestResponse:
        self.db.add(response)
        self.db.flush()
        self.db.refresh(response)
        return response
