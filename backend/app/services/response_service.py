from datetime import datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.enums import RequestStatus, ResponseStatus
from app.models.request_response import RequestResponse
from app.repositories.response_repository import ResponseRepository
from app.repositories.staffing_request_repository import StaffingRequestRepository
from app.services.audit_service import AuditService


class ResponseService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.response_repository = ResponseRepository(db)
        self.request_repository = StaffingRequestRepository(db)
        self.audit_service = AuditService(db)

    def set_status(
        self,
        request_id: UUID,
        worker_user_id: UUID,
        response_status: ResponseStatus,
    ) -> RequestResponse:
        staffing_request = self.request_repository.get(request_id)
        if staffing_request is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Staffing request not found')
        if staffing_request.status in {RequestStatus.CANCELLED, RequestStatus.COMPLETED, RequestStatus.ASSIGNED}:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='Request is closed to responses')

        response = self.response_repository.get_for_request_and_worker(request_id, worker_user_id)
        if response is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Response record not found')

        response.status = response_status
        response.responded_at = datetime.utcnow()
        saved = self.response_repository.save(response)
        staffing_request.status = RequestStatus.RESPONSES_RECEIVED
        self.request_repository.save(staffing_request)

        self.audit_service.log(
            action=f'request_response.{response_status.value}',
            entity_type='request_response',
            entity_id=saved.id,
            actor_user_id=worker_user_id,
            organization_id=staffing_request.organization_id,
            payload={'staffing_request_id': str(request_id)},
        )
        self.db.commit()
        return saved
