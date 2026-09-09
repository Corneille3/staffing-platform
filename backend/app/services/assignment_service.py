from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.geo import site_distance_m
from app.core.timeutil import shift_end_utc
from app.models.assignment import Assignment
from app.models.enums import AssignmentStatus, RequestStatus, ResponseStatus
from app.models.organization import Organization
from app.schemas.assignment import AssignmentTimesPatch
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
        # Ended-shift guard, same rule as the atomic claim: a shift whose end
        # has passed can't be staffed after the fact. Keyed on the END so a
        # shift already underway (the 8h05 no-show covered at 8h30) stays
        # assignable. After-the-fact attendance is a coordinator hours
        # correction, not an assignment.
        if shift_end_utc(
            staffing_request.work_date, staffing_request.start_time, staffing_request.end_time,
        ) <= datetime.now(timezone.utc):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='This shift has already ended.')

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
                # Hand-off truth (Finding #1): retire the giver's response on the
                # original request so their app stops showing it as theirs. Any
                # non-terminal status (a claimer-giver holds NOTIFIED, not
                # ACCEPTED — 2026-08-09), leaving DECLINED/WITHDRAWN alone.
                giver_response = self.response_repository.get_for_request_and_worker(
                    original.staffing_request_id, original.worker_user_id,
                )
                if giver_response is not None and giver_response.status not in (
                    ResponseStatus.WITHDRAWN, ResponseStatus.DECLINED,
                ):
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
        # Everyone else who was offered this shift learns it's gone — the same
        # courtesy the auto-claim path extends. Push only, after the commit, so
        # a notification failure can't undo the assignment.
        self.dispatcher.notify_request_filled(staffing_request, payload.worker_user_id)
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
        # Arriving after the end is not an arrival: a Start tapped once the
        # shift is over would only seed a ~0 h payroll row (finding #16).
        # Late arrivals mid-shift stay legal; the hours correction covers a
        # forgotten tap. No tolerance here — check-out gets one.
        if staffing_request is not None and shift_end_utc(
            staffing_request.work_date, staffing_request.start_time, staffing_request.end_time,
        ) <= datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='This shift has already ended; check-in is closed. Ask your coordinator to record your hours.',
            )
        geo = self._geofence(staffing_request, latitude, longitude)
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
                **geo,
            },
        )
        self.db.commit()
        self.db.refresh(assignment)
        return assignment

    def check_out(
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
                detail='Workers may only check out for their own assignment.',
            )
        if assignment.checked_out_at is not None:
            return assignment  # idempotent — first check-out wins
        if assignment.checked_in_at is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='Check-out requires a check-in first.',
            )
        if assignment.status not in (AssignmentStatus.PENDING_CONFIRMATION, AssignmentStatus.CONFIRMED):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='Check-out is only allowed for active assignments.',
            )

        staffing_request = self.request_repository.get(assignment.staffing_request_id)
        # A forgotten Done is fixable for a while — the reminder push fires at
        # end + checkout_reminder_delay_minutes, and the parking-lot tap lands
        # soon after. Past the cutoff the stamp is a guess, so the coordinator
        # correction (with its mandatory reason) is the only way to close it.
        if staffing_request is not None and datetime.now(timezone.utc) >= shift_end_utc(
            staffing_request.work_date, staffing_request.start_time, staffing_request.end_time,
        ) + timedelta(minutes=settings.checkout_cutoff_minutes):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f'Check-out closed {settings.checkout_cutoff_minutes} minutes after the shift end. '
                    'Ask your coordinator to correct your hours.'
                ),
            )
        geo = self._geofence(staffing_request, latitude, longitude)
        assignment.checked_out_at = datetime.now(timezone.utc)
        assignment.checked_out_latitude = latitude
        assignment.checked_out_longitude = longitude
        # A checked-out shift is done — the only place COMPLETED is set outside
        # a coordinator correction (§2). No auto-close for forgotten check-outs:
        # those stay open for a human to correct, never silently invented.
        assignment.completed_at = assignment.checked_out_at
        assignment.status = AssignmentStatus.COMPLETED
        self.db.add(assignment)
        self.audit_service.log(
            action='assignment.checked_out',
            entity_type='assignment',
            entity_id=assignment.id,
            actor_user_id=assignment.worker_user_id,
            organization_id=staffing_request.organization_id if staffing_request else None,
            payload={
                'staffing_request_id': str(assignment.staffing_request_id),
                'worker_user_id': str(assignment.worker_user_id),
                'checked_out_at': assignment.checked_out_at.isoformat(),
                'worked_hours': assignment.worked_hours,
                **geo,
            },
        )
        self.db.commit()
        self.db.refresh(assignment)
        return assignment

    def correct_times(
        self,
        assignment_id: UUID,
        payload: AssignmentTimesPatch,
        actor_user_id: UUID,
        allowed_org_ids: list[UUID],
    ) -> Assignment:
        """Coordinator repair path (§5): fix a wrong stamp or close a forgotten
        check-out. Reason is mandatory — a payroll edit without a why is the
        thing an auditor asks about."""
        assignment = self.assignment_repository.get(assignment_id)
        if assignment is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Assignment not found')
        staffing_request = self.request_repository.get(assignment.staffing_request_id)
        if staffing_request is None or staffing_request.organization_id not in allowed_org_ids:
            # 404, not 403 — same shape as "not found" so cross-tenant probing
            # can't map which assignment ids exist.
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Assignment not found')
        if assignment.status in (AssignmentStatus.CANCELLED, AssignmentStatus.RELEASED):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='Cancelled or released assignments have no worked time to correct.',
            )
        if payload.checked_in_at is None and payload.checked_out_at is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='Provide checked_in_at, checked_out_at, or both.',
            )

        old_in, old_out = assignment.checked_in_at, assignment.checked_out_at
        new_in = payload.checked_in_at or old_in
        new_out = payload.checked_out_at or old_out
        if new_in is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='Cannot set a check-out on an assignment that was never checked in.',
            )
        if new_out is not None:
            if new_out <= new_in:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail='checked_out_at must be after checked_in_at.',
                )
            if new_out - new_in > timedelta(hours=settings.max_shift_hours):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f'Corrected window exceeds {settings.max_shift_hours} hours.',
                )

        assignment.checked_in_at = new_in
        assignment.checked_out_at = new_out
        assignment.hours_adjusted_by_user_id = actor_user_id
        assignment.hours_adjusted_at = datetime.now(timezone.utc)
        assignment.hours_adjustment_reason = payload.reason
        if new_out is not None:
            # The forgotten-checkout repair: closing the window completes the
            # assignment exactly as a worker tap would have.
            assignment.completed_at = new_out
            assignment.status = AssignmentStatus.COMPLETED
        self.db.add(assignment)
        self.audit_service.log(
            action='assignment.times_corrected',
            entity_type='assignment',
            entity_id=assignment.id,
            actor_user_id=actor_user_id,
            organization_id=staffing_request.organization_id,
            payload={
                'staffing_request_id': str(assignment.staffing_request_id),
                'worker_user_id': str(assignment.worker_user_id),
                'reason': payload.reason,
                'old_checked_in_at': old_in.isoformat() if old_in else None,
                'old_checked_out_at': old_out.isoformat() if old_out else None,
                'new_checked_in_at': new_in.isoformat() if new_in else None,
                'new_checked_out_at': new_out.isoformat() if new_out else None,
            },
        )
        self.db.commit()
        self.db.refresh(assignment)
        return assignment

    def _geofence(self, staffing_request, latitude, longitude) -> dict:
        """Validate the stamp position against the site radius (§3).

        Permissive by default: outside the radius is recorded (geo_ok=False)
        and surfaced, not blocked. With geofence_enforce on, outside → 422
        carrying the distance. Unknown (no site coords / no device position)
        is always allowed, noted as geo_unavailable.
        """
        org = None
        if staffing_request is not None:
            org = self.db.get(Organization, staffing_request.organization_id)
        distance = site_distance_m(org, latitude, longitude) if org is not None else None
        if distance is None:
            return {'geo_ok': None, 'geo_note': 'geo_unavailable'}
        radius = (org.geofence_radius_m or settings.geofence_default_radius_m)
        if distance <= radius:
            return {'geo_ok': True, 'distance_m': int(distance)}
        if settings.geofence_enforce:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f'outside_site_radius: {int(distance)} m from the site (radius {radius} m).',
            )
        return {'geo_ok': False, 'distance_m': int(distance)}

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
        # A cancelled assignment "didn't happen" — clear its attendance stamps
        # so a request never carries them on more than one assignment row.
        # The events themselves are preserved in audit_logs (see check_in/out).
        assignment.checked_in_at = None
        assignment.checked_in_latitude = None
        assignment.checked_in_longitude = None
        assignment.checked_out_at = None
        assignment.checked_out_latitude = None
        assignment.checked_out_longitude = None
        # Reminder/alert stamps travel with the attendance they policed — a
        # re-confirmed assignment must get fresh reminders (SPEC_NOSHOW).
        assignment.checkin_reminder_sent_at = None
        assignment.checkout_reminder_sent_at = None
        assignment.no_show_alerted_at = None
        assignment.completed_at = None
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
