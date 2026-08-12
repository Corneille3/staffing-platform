"""Self-serve replacement — the atomic first-claim-wins engine.

SELF_SERVE_REPLACEMENT_HANDOFF §3. A worker releases a shift to the eligible
pool; the first to claim wins, atomically, with no coordinator in the loop.

The whole feature's safety rests on `claim()`: a single conditional UPDATE is
the lock. Postgres row-locks the request, and a concurrent claimer's WHERE
(status='open') no longer matches once the winner commits → 0 rows → 409. No
read-then-write race, no SELECT ... FOR UPDATE needed (the UPDATE re-evaluates
its WHERE after acquiring the row lock, even under READ COMMITTED).
"""
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.core.timeutil import shift_end_utc, shift_start_utc
from app.models.assignment import Assignment
from app.models.enums import (
    SELF_SERVE_ORIGINS,
    AssignmentStatus,
    NotificationChannel,
    RequestOrigin,
    RequestStatus,
    ReplacementPolicy,
    ResponseStatus,
)
from app.models.organization import Organization
from app.models.request_notification import RequestNotification
from app.models.request_requirement import RequestRequirement
from app.models.request_response import RequestResponse
from app.models.staffing_request import StaffingRequest
from app.models.user import User
from app.notifications.notification_dispatcher import NotificationDispatcher
from app.repositories.assignment_repository import AssignmentRepository
from app.repositories.worker_repository import WorkerRepository
from app.services.audit_service import AuditService
from app.services.matching_service import MatchingService
from app.services.staffing_request_service import StaffingRequestService

# Only worker-originated, auto-assign requests are claimable this way. Defined
# in models.enums (and re-exported here, where callers already look for it) so
# the notification dispatcher can share the rule without a circular import.
# A reason must be one of these (or omitted).
RELEASE_REASONS = {'sick', 'family', 'personal', 'other'}
# A release is "live" (one per held assignment) while it's still seeking a fill,
# whether auto (OPEN) or managed (NOTIFIED / RESPONSES_RECEIVED).
_ACTIVE_RELEASE_STATUSES = (
    RequestStatus.OPEN,
    RequestStatus.NOTIFIED,
    RequestStatus.RESPONSES_RECEIVED,
)


class ReplacementService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.audit_service = AuditService(db)
        self.matching_service = MatchingService(db=db)
        self.assignment_repository = AssignmentRepository(db)
        self.worker_repository = WorkerRepository(db)
        self.dispatcher = NotificationDispatcher(db)

    def broadcast(self, request: StaffingRequest) -> int:
        """Notify the eligible pool about an open replacement (§4). Mirrors the
        coordinator publish recipient logic, but leaves status OPEN so the
        atomic claim (which keys on status='open') can win. Creates a
        RequestResponse(NOTIFIED) per recipient so the shift appears in their
        inbox and the giver's waiting tally can count. Returns the recipient
        count. Idempotent-ish: skips workers who already have a response row."""
        org = self.db.get(Organization, request.organization_id)
        workers = (
            self.worker_repository.list_for_tenant(org.tenant_id)
            if org and org.tenant_id else self.worker_repository.list()
        )
        eligible = self.matching_service.eligible_workers(request, workers)
        recipients = [
            w for w in eligible
            if w.id != request.created_by_user_id  # never alert the giver about their own release
            and self.matching_service.wants_notification(request, w)
        ]
        for worker in recipients:
            self.db.add(RequestNotification(
                id=uuid4(), staffing_request_id=request.id, worker_user_id=worker.id,
                channel=NotificationChannel.IN_APP, delivery_status='queued',
            ))
            existing = self.db.scalar(select(RequestResponse).where(
                RequestResponse.staffing_request_id == request.id,
                RequestResponse.worker_user_id == worker.id,
            ))
            if existing is None:
                self.db.add(RequestResponse(
                    id=uuid4(), staffing_request_id=request.id,
                    worker_user_id=worker.id, status=ResponseStatus.NOTIFIED,
                ))
        self.db.commit()
        self.dispatcher.notify_workers(request, recipients)
        return len(recipients)

    def _copy_requirements(self, source_id: UUID, target_id: UUID) -> None:
        """Clone the original request's qualification/certification requirements
        onto the replacement so eligibility filtering is faithful (§4)."""
        for req in self.db.scalars(select(RequestRequirement).where(
            RequestRequirement.staffing_request_id == source_id,
        )):
            self.db.add(RequestRequirement(
                id=uuid4(), staffing_request_id=target_id,
                requirement_type=req.requirement_type,
                requirement_code=req.requirement_code,
                requirement_label=req.requirement_label,
                is_required=req.is_required,
            ))

    def release(self, request_id: UUID, scope: AccessScope, reason: str | None) -> StaffingRequest:
        """A contractor releases a held shift to the pool (§2). Keyed on the
        request the worker holds — the worker UI has the request, not the
        assignment. Creates a worker_replacement request pointing at their
        assignment and broadcasts per the org policy:
          - auto:    stays OPEN + auto_assign, first-claim wins (no coordinator)
          - managed: published through the normal dispatch — workers accept/
                     decline and the coordinator assigns from the responses.
        Either way the giver KEEPS the shift until it's filled (§7).
        """
        if reason is not None and reason not in RELEASE_REASONS:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, 'Unknown release reason.')

        original = self.db.get(StaffingRequest, request_id)
        if original is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, 'Shift not found.')
        assignment = self.db.scalar(
            select(Assignment).where(
                Assignment.staffing_request_id == request_id,
                Assignment.worker_user_id == scope.user.id,
                Assignment.status == AssignmentStatus.CONFIRMED,
            )
        )
        if assignment is None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                'You do not hold a confirmed assignment for this shift.',
            )

        org = self.db.get(Organization, original.organization_id)
        if scope.tenant_id is None or org.tenant_id != scope.tenant_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, 'Out of scope.')

        allowed = org.replacement_allowed_roles or []
        if original.role is None or original.role.value not in allowed:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                'This role is not enabled for self-serve replacement.',
            )

        # Lead-time window. Shift times are Québec wall clock — interpreted in
        # settings.shift_timezone (see core/timeutil). Distinct messages: a
        # shift that already started is a different mistake than one inside
        # the org's lead window.
        shift_start = shift_start_utc(original.work_date, original.start_time)
        minutes_until = (shift_start - datetime.now(timezone.utc)).total_seconds() / 60
        if minutes_until < 0:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                'This shift has already started — contact your coordinator instead.',
            )
        if minutes_until < org.min_release_lead_minutes:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                'Too close to the shift start to release it.',
            )

        # One live release per assignment.
        existing = self.db.scalar(
            select(StaffingRequest).where(
                StaffingRequest.replaces_assignment_id == assignment.id,
                StaffingRequest.status.in_(_ACTIVE_RELEASE_STATUSES),
            )
        )
        if existing is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                'A replacement is already being sought for this shift.',
            )

        managed = org.replacement_policy == ReplacementPolicy.MANAGED
        replacement = StaffingRequest(
            id=uuid4(),
            organization_id=original.organization_id,
            created_by_user_id=scope.user.id,
            request_type=original.request_type,
            role=original.role,
            hourly_rate=original.hourly_rate,
            status=RequestStatus.OPEN,
            origin=RequestOrigin.WORKER_REPLACEMENT,
            # auto → claimable (first wins); managed → coordinator assigns from responses.
            auto_assign=not managed,
            replaces_assignment_id=assignment.id,
            release_reason=reason,
            title=original.title,
            description=original.description,
            city=original.city,
            location_name=original.location_name,
            work_date=original.work_date,
            start_time=original.start_time,
            end_time=original.end_time,
            urgency_level=original.urgency_level,
            language_requirement=original.language_requirement,
            coverage_type=original.coverage_type,
            contact_name=original.contact_name,
            contact_phone=original.contact_phone,
            contact_email=original.contact_email,
            arrival_instructions=original.arrival_instructions,
        )
        self.db.add(replacement)
        self.db.flush()
        self._copy_requirements(original.id, replacement.id)

        self.audit_service.log(
            action='replacement.released',
            entity_type='staffing_request',
            entity_id=replacement.id,
            actor_user_id=scope.user.id,
            organization_id=original.organization_id,
            payload={
                'replaces_assignment_id': str(assignment.id),
                'original_request_id': str(original.id),
                'reason': reason,
                'policy': org.replacement_policy.value,
            },
        )
        self.db.commit()
        self.db.refresh(replacement)
        self._dispatch(replacement, managed)
        return replacement

    def _dispatch(self, replacement: StaffingRequest, managed: bool) -> None:
        """Alert the eligible pool. Managed → publish through the normal dispatch
        (status NOTIFIED; workers accept/decline, coordinator assigns). Auto →
        broadcast and stay OPEN so the atomic claim can win."""
        if managed:
            StaffingRequestService(self.db).publish(replacement.id)
            self.db.refresh(replacement)
        else:
            self.broadcast(replacement)

    def report_absence(self, payload, scope: AccessScope) -> StaffingRequest:
        """Permanent-staff path (§0, §1): a worker whose schedule lives OUTSIDE
        StaffiG describes a shift they'll miss. No held assignment to release —
        this creates a staff_absence request and broadcasts it like a release.
        """
        from app.models.enums import RequestType  # local: avoid top-level churn

        if scope.tenant_id is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, 'No tenant associated with your account.')
        if payload.reason is not None and payload.reason not in RELEASE_REASONS:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, 'Unknown reason.')

        org = self.db.get(Organization, payload.organization_id)
        if org is None or org.tenant_id != scope.tenant_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, 'Out of scope.')
        if payload.role.value not in (org.replacement_allowed_roles or []):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                'This role is not enabled for self-serve replacement.',
            )

        shift_start = shift_start_utc(payload.work_date, payload.start_time)
        minutes_until = (shift_start - datetime.now(timezone.utc)).total_seconds() / 60
        if minutes_until < 0:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                'That shift is already in the past — pick an upcoming one.',
            )
        if minutes_until < org.min_release_lead_minutes:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                'Too close to the shift start to report it.',
            )

        managed = org.replacement_policy == ReplacementPolicy.MANAGED
        note = (payload.note or '').strip()
        replacement = StaffingRequest(
            id=uuid4(),
            organization_id=org.id,
            created_by_user_id=scope.user.id,
            request_type=RequestType.PLANNED_REPLACEMENT,
            role=payload.role,
            status=RequestStatus.OPEN,
            origin=RequestOrigin.STAFF_ABSENCE,
            auto_assign=not managed,
            replaces_assignment_id=None,  # permanent staff hold no StaffiG shift
            release_reason=payload.reason,
            title=note or 'Absence à couvrir',
            description=note or None,
            city=org.city,
            work_date=payload.work_date,
            start_time=payload.start_time,
            end_time=payload.end_time,
            language_requirement=org.preferred_language,
        )
        self.db.add(replacement)
        self.db.flush()
        self.audit_service.log(
            action='replacement.absence_reported',
            entity_type='staffing_request',
            entity_id=replacement.id,
            actor_user_id=scope.user.id,
            organization_id=org.id,
            payload={'reason': payload.reason, 'policy': org.replacement_policy.value},
        )
        self.db.commit()
        self.db.refresh(replacement)
        self._dispatch(replacement, managed)
        return replacement

    def my_absence_reports(self, scope: AccessScope) -> list[dict]:
        """The worker's own reported absences + live status — so the report
        page is a hub they can return to, not a fire-and-forget form."""
        now = datetime.now(timezone.utc)
        reqs = list(self.db.scalars(
            select(StaffingRequest)
            .where(
                StaffingRequest.created_by_user_id == scope.user.id,
                StaffingRequest.origin == RequestOrigin.STAFF_ABSENCE,
            )
            .order_by(StaffingRequest.created_at.desc())
            .limit(25)
        ))
        items: list[dict] = []
        for r in reqs:
            responses = list(self.db.scalars(select(RequestResponse).where(
                RequestResponse.staffing_request_id == r.id,
            )))
            shift_started = shift_start_utc(r.work_date, r.start_time) <= now
            if r.status in (RequestStatus.ASSIGNED, RequestStatus.COMPLETED):
                st = 'filled'
            elif r.status == RequestStatus.CANCELLED:
                st = 'cancelled'
            elif r.status == RequestStatus.EXPIRED:
                st = 'unfilled'
            else:  # open / notified / responses_received
                st = 'unfilled' if shift_started else 'searching'
            claimed_by_name = None
            if st == 'filled' and r.assigned_worker_user_id:
                claimer = self.db.get(User, r.assigned_worker_user_id)
                if claimer:
                    claimed_by_name = f'{claimer.first_name} {claimer.last_name}'.strip()
            items.append({
                'request_id': r.id,
                'title': r.title,
                'role': r.role.value if r.role else None,
                'work_date': r.work_date,
                'start_time': r.start_time,
                'end_time': r.end_time,
                'reason': r.release_reason,
                'status': st,
                'claimed_by_name': claimed_by_name,
                'alerted': len(responses),
                'viewed': sum(1 for resp in responses if resp.viewed_at is not None),
            })
        return items

    def absence_options(self, scope: AccessScope) -> list[dict]:
        """The sites a worker can report an absence at (their tenant's orgs) +
        each site's self-serve-allowed roles, for the AbsenceReport form."""
        if scope.tenant_id is None:
            return []
        orgs = self.db.scalars(select(Organization).where(
            Organization.tenant_id == scope.tenant_id,
            Organization.is_active.is_(True),
        ).order_by(Organization.name))
        return [
            {
                'id': str(o.id),
                'name': o.name,
                'city': o.city,
                'allowed_roles': o.replacement_allowed_roles or [],
            }
            for o in orgs
        ]

    def _retire_giver_response(self, original_request_id: UUID, giver_id: UUID, when: datetime) -> None:
        """Retire the giver's response on the original request to WITHDRAWN when
        their released shift gets filled.

        Retires ANY non-terminal status, not just ACCEPTED: a giver who obtained
        the shift by CLAIMING an earlier release holds a NOTIFIED response (from
        the broadcast), so an ACCEPTED-only check left it un-retired and the
        tracking page leaked the release CTA back (2026-08-09). DECLINED /
        already-WITHDRAWN are left alone; a missing response (staff_absence) is
        a no-op."""
        response = self.db.scalar(select(RequestResponse).where(
            RequestResponse.staffing_request_id == original_request_id,
            RequestResponse.worker_user_id == giver_id,
        ))
        if response is not None and response.status not in (
            ResponseStatus.WITHDRAWN, ResponseStatus.DECLINED,
        ):
            response.status = ResponseStatus.WITHDRAWN
            response.responded_at = when

    def claim(self, request_id: UUID, claimer_user_id: UUID, tenant_id: UUID) -> Assignment:
        """Claim an open replacement. Exactly one concurrent caller wins (§3).

        Winner: request → assigned, a confirmed assignment is created for the
        claimer, and the released original assignment (if any) is marked
        RELEASED. Losers get 409 ``already_filled``. A double-tap by the same
        winner is idempotent — it returns the existing assignment, not a 409.

        Tenant isolation is enforced in the UPDATE's WHERE (the request's org
        must belong to ``tenant_id``) — we scope in-app, not via Postgres RLS.
        """
        now = datetime.now(timezone.utc)

        # Double-booking guard: lock the claimer's user row first so two
        # simultaneous taps by the SAME worker on different overlapping
        # releases serialize — the second sees the first's fresh assignment
        # and 409s. Different claimers lock different rows, so the
        # request-level first-claim-wins race is untouched.
        self.db.execute(select(User.id).where(User.id == claimer_user_id).with_for_update())
        claimed = self.db.get(StaffingRequest, request_id)

        # Ended-shift guard (belt-and-suspenders for the async sweep): an OPEN
        # shift whose end has passed must not be claimable, even if the sweep
        # hasn't marked it EXPIRED yet. Keyed on the END, so covering a shift
        # already underway (the 8h05 no-show taken at 8h30) stays legal.
        if claimed is not None and shift_end_utc(
            claimed.work_date, claimed.start_time, claimed.end_time,
        ) <= now:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='This shift has already ended.',
            )

        if claimed is not None and self.assignment_repository.overlapping_active_for_worker(
            claimer_user_id,
            claimed.work_date,
            claimed.start_time,
            claimed.end_time,
            exclude_request_id=request_id,  # winner's double-tap stays idempotent
        ):
            self.db.rollback()  # release the row lock — nothing was written
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='You already have a shift that overlaps this one.',
            )

        org_in_tenant = select(Organization.id).where(Organization.tenant_id == tenant_id)

        won = self.db.execute(
            update(StaffingRequest)
            .where(
                StaffingRequest.id == request_id,
                StaffingRequest.status == RequestStatus.OPEN,
                StaffingRequest.origin.in_(SELF_SERVE_ORIGINS),
                StaffingRequest.organization_id.in_(org_in_tenant),
            )
            .values(
                status=RequestStatus.ASSIGNED,
                assigned_worker_user_id=claimer_user_id,
                assigned_at=now,
            )
            .returning(
                StaffingRequest.replaces_assignment_id,
                StaffingRequest.organization_id,
            )
        ).first()

        if won is None:
            return self._lost_or_idempotent(request_id, claimer_user_id)

        replaces_assignment_id, organization_id = won

        assignment = Assignment(
            id=uuid4(),
            staffing_request_id=request_id,
            worker_user_id=claimer_user_id,
            assigned_by_user_id=claimer_user_id,  # self-serve: claimer IS the assigner
            status=AssignmentStatus.CONFIRMED,
            assigned_at=now,
            confirmed_at=now,
        )
        self.db.add(assignment)

        # Release the original holder's assignment — only the contractor path has
        # one (staff_absence has no StaffiG assignment, so the pointer is NULL).
        if replaces_assignment_id is not None:
            self.db.execute(
                update(Assignment)
                .where(Assignment.id == replaces_assignment_id)
                .values(status=AssignmentStatus.RELEASED, cancelled_at=now)
            )
            # Hand-off truth (Finding #1): retire the giver's ACCEPTED response on
            # the ORIGINAL request so their tracking page + history stop claiming
            # a shift they gave away. The RELEASED assignment carries the record.
            released = self.db.get(Assignment, replaces_assignment_id)
            if released is not None:
                self._retire_giver_response(released.staffing_request_id, released.worker_user_id, now)

        self.audit_service.log(
            action='replacement.claimed',
            entity_type='assignment',
            entity_id=assignment.id,
            actor_user_id=claimer_user_id,
            organization_id=organization_id,
            payload={
                'staffing_request_id': str(request_id),
                'replaces_assignment_id': str(replaces_assignment_id) if replaces_assignment_id else None,
            },
        )
        self.db.commit()
        self.db.refresh(assignment)
        return assignment

    def _lost_or_idempotent(self, request_id: UUID, claimer_user_id: UUID) -> Assignment:
        """The UPDATE matched 0 rows. Either someone else won (→ 409) or this
        same claimer already won a prior tap (→ idempotent success)."""
        self.db.rollback()  # discard the no-op transaction
        request = self.db.get(StaffingRequest, request_id)
        if (
            request is not None
            and request.status == RequestStatus.ASSIGNED
            and request.assigned_worker_user_id == claimer_user_id
        ):
            existing = self.db.scalar(
                select(Assignment).where(
                    Assignment.staffing_request_id == request_id,
                    Assignment.worker_user_id == claimer_user_id,
                )
            )
            if existing is not None:
                return existing
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='already_filled')

    def cancel_release(self, request_id: UUID, scope: AccessScope) -> StaffingRequest:
        """The giver changes their mind before the shift is filled (§7). The
        replacement is cancelled and they keep the shift (the original
        assignment was never touched). Works while it's still seeking a fill —
        OPEN (auto) or NOTIFIED/RESPONSES_RECEIVED (managed)."""
        request = self.db.get(StaffingRequest, request_id)
        if request is None or request.origin not in SELF_SERVE_ORIGINS:
            raise HTTPException(status.HTTP_404_NOT_FOUND, 'Replacement not found.')
        if request.created_by_user_id != scope.user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, 'Only the giver can cancel this.')
        if request.status not in _ACTIVE_RELEASE_STATUSES:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                'This shift has already been claimed or closed.',
            )
        request.status = RequestStatus.CANCELLED
        request.cancelled_at = datetime.now(timezone.utc)
        self.audit_service.log(
            action='replacement.cancelled',
            entity_type='staffing_request',
            entity_id=request.id,
            actor_user_id=scope.user.id,
            organization_id=request.organization_id,
            payload={'replaces_assignment_id': str(request.replaces_assignment_id)},
        )
        self.db.commit()
        self.db.refresh(request)
        return request

    def active_replacement_for(self, original_request_id: UUID, scope: AccessScope) -> dict | None:
        """The caller's live release for a shift they still hold, if any.

        Lets the giver's tracking page render the 'waiting for a claim' state on
        a fresh load (new tab / back-arrow / from History) instead of re-offering
        the release CTA — which would 409 'already being sought'. Returns a
        replacement_status-shaped dict, or None when no release is pending.
        """
        assignment = self.db.scalar(select(Assignment).where(
            Assignment.staffing_request_id == original_request_id,
            Assignment.worker_user_id == scope.user.id,
            Assignment.status.in_((AssignmentStatus.CONFIRMED, AssignmentStatus.PENDING_CONFIRMATION)),
        ))
        if assignment is None:
            return None
        replacement = self.db.scalar(select(StaffingRequest).where(
            StaffingRequest.replaces_assignment_id == assignment.id,
            StaffingRequest.status.in_(_ACTIVE_RELEASE_STATUSES),
        ))
        if replacement is None:
            return None
        return self.replacement_status(replacement.id, scope)

    def replacement_status(self, request_id: UUID, scope: AccessScope) -> dict:
        """Compact status for the giver's waiting screen (§6 ReplacementWaiting):
        live tally + the filled state once someone claims."""
        request = self.db.get(StaffingRequest, request_id)
        if request is None or request.origin not in SELF_SERVE_ORIGINS:
            raise HTTPException(status.HTTP_404_NOT_FOUND, 'Replacement not found.')
        org = self.db.get(Organization, request.organization_id)
        if scope.tenant_id is None or org.tenant_id != scope.tenant_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, 'Out of scope.')

        responses = list(self.db.scalars(select(RequestResponse).where(
            RequestResponse.staffing_request_id == request_id,
        )))
        filled = request.status == RequestStatus.ASSIGNED
        claimed_by_name = None
        if filled and request.assigned_worker_user_id:
            claimer = self.db.get(User, request.assigned_worker_user_id)
            if claimer:
                claimed_by_name = f'{claimer.first_name} {claimer.last_name}'.strip()

        # Belt-and-suspenders for the async sweep: an unfilled shift whose end
        # has passed reads as expired now, not "searching" until the next tick.
        status_value = request.status.value
        if not filled and status_value not in ('cancelled', 'expired') and shift_end_utc(
            request.work_date, request.start_time, request.end_time,
        ) <= datetime.now(timezone.utc):
            status_value = 'expired'

        return {
            'request_id': request.id,
            'status': status_value,
            'alerted': len(responses),
            'viewed': sum(1 for r in responses if r.viewed_at is not None),
            'filled': filled,
            'claimed_by_name': claimed_by_name,
        }
