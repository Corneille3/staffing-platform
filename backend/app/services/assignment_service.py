from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.assignment import Assignment
from app.models.enums import AssignmentStatus, RequestStatus, ResponseStatus
from app.repositories.assignment_repository import AssignmentRepository
from app.repositories.response_repository import ResponseRepository
from app.repositories.staffing_request_repository import StaffingRequestRepository
from app.schemas.assignment import AssignmentCancel, AssignmentCreate
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
            assigned_at=datetime.now(timezone.utc),
            confirmed_at=datetime.now(timezone.utc),
            notes=payload.notes,
        )
        created = self.assignment_repository.create(assignment)
        staffing_request.status = RequestStatus.ASSIGNED
        staffing_request.assigned_worker_user_id = payload.worker_user_id
        staffing_request.assigned_at = datetime.now(timezone.utc)
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

    def cancel(self, assignment_id: UUID, payload: AssignmentCancel, actor_user_id: UUID) -> Assignment:
        assignment = self.assignment_repository.get(assignment_id)
        if assignment is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Assignment not found')
        if assignment.status == AssignmentStatus.CANCELLED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='Assignment is already cancelled')
        if assignment.status == AssignmentStatus.COMPLETED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='Completed assignments cannot be cancelled')

        staffing_request = self.request_repository.get(assignment.staffing_request_id)
        if staffing_request is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Staffing request not found')

        assignment.status = AssignmentStatus.CANCELLED
        assignment.cancelled_at = datetime.now(timezone.utc)
        assignment.notes = self._append_cancellation_note(assignment.notes, payload)
        self.db.add(assignment)

        response = self.response_repository.get_for_request_and_worker(
            assignment.staffing_request_id,
            assignment.worker_user_id,
        )
        if response is not None:
            response.status = ResponseStatus.DECLINED
            response.responded_at = datetime.now(timezone.utc)
            self.response_repository.save(response)

        staffing_request.status = RequestStatus.RESPONSES_RECEIVED
        staffing_request.assigned_worker_user_id = None
        staffing_request.assigned_at = None
        self.request_repository.save(staffing_request)

        self.audit_service.log(
            action='assignment.cancelled',
            entity_type='assignment',
            entity_id=assignment.id,
            actor_user_id=actor_user_id,
            organization_id=staffing_request.organization_id,
            payload={
                'staffing_request_id': str(assignment.staffing_request_id),
                'worker_user_id': str(assignment.worker_user_id),
                'reason': payload.reason,
            },
        )
        self.db.commit()
        self.db.refresh(assignment)
        return assignment

    @staticmethod
    def _append_cancellation_note(existing: str | None, payload: AssignmentCancel) -> str:
        note_parts = [f'Cancellation reason: {payload.reason}']
        if payload.notes:
            note_parts.append(f'Cancellation notes: {payload.notes}')
        cancellation_note = '\n'.join(note_parts)
        return f'{existing}\n\n{cancellation_note}' if existing else cancellation_note
