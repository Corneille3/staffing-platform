from datetime import datetime
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.assignment import Assignment
from app.models.enums import AssignmentStatus, RequestStatus, ResponseStatus
from app.repositories.assignment_repository import AssignmentRepository
from app.repositories.response_repository import ResponseRepository
from app.repositories.staffing_request_repository import StaffingRequestRepository
from app.schemas.assignment import AssignmentCreate
from app.services.audit_service import AuditService


class AssignmentService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.assignment_repository = AssignmentRepository(db)
        self.request_repository = StaffingRequestRepository(db)
        self.response_repository = ResponseRepository(db)
        self.audit_service = AuditService(db)

    def assign(self, payload: AssignmentCreate) -> Assignment:
        staffing_request = self.request_repository.get(payload.staffing_request_id)
        if staffing_request is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Staffing request not found')
        if staffing_request.status == RequestStatus.CANCELLED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='Cancelled requests cannot be assigned')
        if self.assignment_repository.get_by_request(payload.staffing_request_id) is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='Request is already assigned')

        response = self.response_repository.get_for_request_and_worker(payload.staffing_request_id, payload.worker_user_id)
        if response is None or response.status != ResponseStatus.ACCEPTED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='Worker must accept the request before assignment',
            )

        assignment = Assignment(
            id=uuid4(),
            staffing_request_id=payload.staffing_request_id,
            worker_user_id=payload.worker_user_id,
            assigned_by_user_id=payload.assigned_by_user_id,
            status=AssignmentStatus.CONFIRMED,
            assigned_at=datetime.utcnow(),
            confirmed_at=datetime.utcnow(),
            notes=payload.notes,
        )
        created = self.assignment_repository.create(assignment)
        staffing_request.status = RequestStatus.ASSIGNED
        staffing_request.assigned_worker_user_id = payload.worker_user_id
        staffing_request.assigned_at = datetime.utcnow()
        self.request_repository.save(staffing_request)

        self.audit_service.log(
            action='assignment.confirmed',
            entity_type='assignment',
            entity_id=created.id,
            actor_user_id=payload.assigned_by_user_id,
            organization_id=staffing_request.organization_id,
            payload={'staffing_request_id': str(payload.staffing_request_id), 'worker_user_id': str(payload.worker_user_id)},
        )
        self.db.commit()
        return created
