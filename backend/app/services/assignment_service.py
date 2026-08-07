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
from app.notifications.notification_dispatcher import NotificationDispatcher
from app.repositories.worker_repository import WorkerRepository
from app.services.audit_service import AuditService


class AssignmentService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.assignment_repository = AssignmentRepository(db)
        self.request_repository = StaffingRequestRepository(db)
        self.response_repository = ResponseRepository(db)
        self.worker_repository = WorkerRepository(db)
        self.audit_service = AuditService(db)
        self.dispatcher = NotificationDispatcher(db)

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

        # Double-booking guard: one human, one place. Checked across tenants —
        # accepting two overlapping requests is allowed (coordinators want to
        # see willingness), but only one can become an assignment.
        conflicts = self.assignment_repository.overlapping_active_for_worker(
            payload.worker_user_id,
            staffing_request.work_date,
            staffing_request.start_time,
            staffing_request.end_time,
            exclude_request_id=staffing_request.id,
        )
        if conflicts:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='Worker already has an overlapping assignment on this date',
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

        # Self-serve replacement, managed mode (SELF_SERVE §5): assigning a
        # released shift frees the original holder — mirrors what the atomic
        # claim does in auto mode.
        if staffing_request.replaces_assignment_id is not None:
            original = self.assignment_repository.get(staffing_request.replaces_assignment_id)
            if original is not None and original.status == AssignmentStatus.CONFIRMED:
                # Tracked ORM object — the commit at the end of assign() persists it.
                original.status = AssignmentStatus.RELEASED
                original.cancelled_at = datetime.now(timezone.utc)
                # Hand-off truth (Finding #1): retire the giver's ACCEPTED response
                # on the original request so their app stops showing it as theirs.
                giver_response = self.response_repository.get_for_request_and_worker(
                    original.staffing_request_id, original.worker_user_id,
                )
                if giver_response is not None and giver_response.status == ResponseStatus.ACCEPTED:
                    giver_response.status = ResponseStatus.WITHDRAWN
                    giver_response.responded_at = datetime.now(timezone.utc)

        self.audit_service.log(
            action='assignment.confirmed',
            entity_type='assignment',
            entity_id=created.id,
            actor_user_id=payload.assigned_by_user_id,
            organization_id=staffing_request.organization_id,
            payload={'staffing_request_id': str(payload.staffing_request_id), 'worker_user_id': str(payload.worker_user_id)},
        )
        self.db.commit()
        worker = self.worker_repository.get(payload.worker_user_id)
        if worker:
            self.dispatcher.notify_assignment_confirmed(staffing_request, worker)
        return created

    def check_in(
        self,
        assignment_id: UUID,
        latitude,
        longitude,
        actor_user_id: UUID,
        is_admin: bool,
    ) -> Assignment:
        assignment = self.assignment_repository.get(assignment_id)
        if assignment is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Assignment not found')
        if not is_admin and assignment.worker_user_id != actor_user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail='Workers may only check in for their own assignment.',
            )
        if assignment.status not in (AssignmentStatus.PENDING_CONFIRMATION, AssignmentStatus.CONFIRMED):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='Check-in is only allowed for active assignments.',
            )
        if assignment.checked_in_at is not None:
            return assignment  # idempotent — first check-in wins

        staffing_request = self.request_repository.get(assignment.staffing_request_id)
        assignment.checked_in_at = datetime.now(timezone.utc)
        assignment.checked_in_latitude = latitude
        assignment.checked_in_longitude = longitude
        self.db.add(assignment)
        # Record the check-in in the audit trail so the event survives even if
        # the assignment is later cancelled (which clears these columns).
        self.audit_service.log(
            action='assignment.checked_in',
            entity_type='assignment',
            entity_id=assignment.id,
            actor_user_id=assignment.worker_user_id,
            organization_id=staffing_request.organization_id if staffing_request else None,
            payload={
                'staffing_request_id': str(assignment.staffing_request_id),
                'worker_user_id': str(assignment.worker_user_id),
                'checked_in_at': assignment.checked_in_at.isoformat(),
            },
        )
        self.db.commit()
        self.db.refresh(assignment)
        return assignment

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
        # A cancelled assignment "didn't happen" — clear its check-in so a
        # request never carries check-in data on more than one assignment row.
        # The check-in event itself is preserved in audit_logs (see check_in).
        assignment.checked_in_at = None
        assignment.checked_in_latitude = None
        assignment.checked_in_longitude = None
        assignment.notes = self._append_cancellation_note(assignment.notes, payload)
        self.db.add(assignment)

        response = self.response_repository.get_for_request_and_worker(
            assignment.staffing_request_id,
            assignment.worker_user_id,
        )
        if response is not None:
            # Reset the response to a clean "notified" state — including
            # viewed_at, so the row isn't left as "notified but previously
            # viewed", which is semantically inconsistent.
            response.status = ResponseStatus.NOTIFIED
            response.responded_at = None
            response.decline_reason = None
            response.viewed_at = None
            self.response_repository.save(response)

        staffing_request.status = RequestStatus.RESPONSES_RECEIVED
        staffing_request.assigned_worker_user_id = None
        staffing_request.assigned_at = None
        self.request_repository.save(staffing_request)

        cancelled_worker_id = assignment.worker_user_id
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
        worker = self.worker_repository.get(cancelled_worker_id)
        if worker:
            self.dispatcher.notify_assignment_cancelled(staffing_request, worker)
        return assignment

    @staticmethod
    def _append_cancellation_note(existing: str | None, payload: AssignmentCancel) -> str:
        note_parts = [f'Cancellation reason: {payload.reason}']
        if payload.notes:
            note_parts.append(f'Cancellation notes: {payload.notes}')
        cancellation_note = '\n'.join(note_parts)
        return f'{existing}\n\n{cancellation_note}' if existing else cancellation_note
