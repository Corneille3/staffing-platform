"""Hand-off truth after a released shift is filled (Finding #1, 2026-08-06).

When a giver's released shift is claimed (auto) or assigned (managed), the
giver's side of the ORIGINAL request must retire: their assignment → RELEASED
(pre-existing) AND their ACCEPTED response → WITHDRAWN, so their app + the
coordinator's original-request view stop showing the shift as theirs.
"""
from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select

from app.auth.scope import AccessScope
from app.models.assignment import Assignment
from app.models.enums import (
    AssignmentStatus,
    RequestOrigin,
    RequestRole,
    RequestStatus,
    RequestType,
    ResponseStatus,
)
from app.models.request_response import RequestResponse
from app.models.staffing_request import StaffingRequest
from app.repositories.assignment_repository import AssignmentRepository
from app.schemas.assignment import AssignmentCreate
from app.services.assignment_service import AssignmentService
from app.services.replacement_service import ReplacementService
from app.services.response_service import ResponseService

WORK_DATE = date.today() + timedelta(days=14)


def _worker_scope(seed, worker):
    return AccessScope(user=worker, tenant_id=seed.tenant.id)


def _original_with_giver(db_session, seed, giver):
    """An assigned coordinator request + the giver's confirmed assignment AND
    their ACCEPTED response (as the real accept→assign flow leaves it)."""
    req = StaffingRequest(
        id=uuid4(), organization_id=seed.org.id, created_by_user_id=seed.org_admin.id,
        request_type=RequestType.URGENT_REPLACEMENT, role=RequestRole.EDUCATOR,
        status=RequestStatus.ASSIGNED, origin=RequestOrigin.COORDINATOR,
        title='Quart', city='IntTestCity', assigned_worker_user_id=giver.id,
        work_date=WORK_DATE, start_time=time(8, 0), end_time=time(16, 0),
    )
    db_session.add(req)
    db_session.flush()
    assignment = Assignment(
        id=uuid4(), staffing_request_id=req.id, worker_user_id=giver.id,
        assigned_by_user_id=seed.org_admin.id, status=AssignmentStatus.CONFIRMED,
        assigned_at=datetime.now(timezone.utc), confirmed_at=datetime.now(timezone.utc),
    )
    db_session.add(assignment)
    db_session.add(RequestResponse(
        id=uuid4(), staffing_request_id=req.id, worker_user_id=giver.id,
        status=ResponseStatus.ACCEPTED, responded_at=datetime.now(timezone.utc),
    ))
    db_session.flush()
    return req, assignment


def _giver_response(db_session, request_id, giver_id):
    return db_session.scalar(select(RequestResponse).where(
        RequestResponse.staffing_request_id == request_id,
        RequestResponse.worker_user_id == giver_id,
    ))


# ── two-hop: a claimer who then releases must also be retired ───────────────────

def test_claimer_who_releases_is_retired_on_next_handoff(db_session, seed):
    """A giver who obtained the shift by CLAIMING has a NOTIFIED response (from
    the broadcast), not ACCEPTED. When they release and it's re-claimed, their
    response must still retire to WITHDRAWN — else their tracking page leaks the
    'I need a replacement' CTA back (Finding, 2026-08-09)."""
    from app.models.enums import ReplacementPolicy

    seed.org.replacement_policy = ReplacementPolicy.AUTO
    db_session.flush()

    # Hop 1: worker_a holds, releases; worker_b claims → b now holds via claim.
    original, _ = _original_with_giver(db_session, seed, seed.worker_a)
    repl1 = ReplacementService(db_session).release(
        original.id, _worker_scope(seed, seed.worker_a), reason='sick',
    )
    ReplacementService(db_session).claim(repl1.id, seed.worker_b.id, seed.tenant.id)
    # b's response on repl1 is NOTIFIED (broadcast), not ACCEPTED.
    assert _giver_response(db_session, repl1.id, seed.worker_b.id).status == ResponseStatus.NOTIFIED

    # Hop 2: b releases repl1; worker_a claims it back.
    repl2 = ReplacementService(db_session).release(
        repl1.id, _worker_scope(seed, seed.worker_b), reason='family',
    )
    ReplacementService(db_session).claim(repl2.id, seed.worker_a.id, seed.tenant.id)

    # b handed repl1 off → their response on repl1 must be retired to WITHDRAWN.
    assert _giver_response(db_session, repl1.id, seed.worker_b.id).status == ResponseStatus.WITHDRAWN


# ── auto (claim) ───────────────────────────────────────────────────────────────

def test_claim_retires_giver_response_and_assignment(db_session, seed):
    original, giver_assignment = _original_with_giver(db_session, seed, seed.worker_a)
    replacement = ReplacementService(db_session).release(
        original.id, _worker_scope(seed, seed.worker_a), reason='sick',
    )
    ReplacementService(db_session).claim(replacement.id, seed.worker_b.id, seed.tenant.id)

    db_session.refresh(giver_assignment)
    assert giver_assignment.status == AssignmentStatus.RELEASED
    # Giver's ACCEPTED response on the ORIGINAL is retired → their app stops
    # showing it as theirs (history "Released", tracking page no release CTA).
    assert _giver_response(db_session, original.id, seed.worker_a.id).status == ResponseStatus.WITHDRAWN


def test_original_request_shows_no_live_assignee_after_handoff(db_session, seed):
    original, _ = _original_with_giver(db_session, seed, seed.worker_a)
    replacement = ReplacementService(db_session).release(
        original.id, _worker_scope(seed, seed.worker_a), reason=None,
    )
    ReplacementService(db_session).claim(replacement.id, seed.worker_b.id, seed.tenant.id)

    # Coordinator detail resolves the live assignment via get_by_request — the
    # giver's RELEASED row must not surface as the current assignee (symptom 2).
    assert AssignmentRepository(db_session).get_by_request(original.id) is None


# ── managed (coordinator assign) ───────────────────────────────────────────────

def test_managed_assign_retires_giver_response(db_session, seed):
    from app.models.enums import ReplacementPolicy

    seed.org.replacement_policy = ReplacementPolicy.MANAGED
    db_session.flush()
    original, giver_assignment = _original_with_giver(db_session, seed, seed.worker_a)
    replacement = ReplacementService(db_session).release(
        original.id, _worker_scope(seed, seed.worker_a), reason=None,
    )
    assert replacement.status == RequestStatus.NOTIFIED

    ResponseService(db_session).set_status(replacement.id, seed.worker_b.id, ResponseStatus.ACCEPTED)
    AssignmentService(db_session).assign(AssignmentCreate(
        staffing_request_id=replacement.id,
        worker_user_id=seed.worker_b.id,
        assigned_by_user_id=seed.org_admin.id,
    ))

    db_session.refresh(giver_assignment)
    assert giver_assignment.status == AssignmentStatus.RELEASED
    assert _giver_response(db_session, original.id, seed.worker_a.id).status == ResponseStatus.WITHDRAWN


# ── active-replacement lookup (giver's "waiting" state on reload) ──────────────

def test_active_replacement_tracks_pending_then_clears(db_session, seed):
    original, _ = _original_with_giver(db_session, seed, seed.worker_a)
    svc = ReplacementService(db_session)
    giver = _worker_scope(seed, seed.worker_a)

    # Nothing pending before release.
    assert svc.active_replacement_for(original.id, giver) is None

    # After release → the giver's tracking page can show "waiting for a claim".
    svc.release(original.id, giver, reason='sick')
    pending = svc.active_replacement_for(original.id, giver)
    assert pending is not None
    assert pending['filled'] is False
    assert pending['status'] in ('open', 'notified')

    # Once claimed, it's no longer an active release → None (page shows released).
    svc.claim(pending['request_id'], seed.worker_b.id, seed.tenant.id)
    assert svc.active_replacement_for(original.id, giver) is None


def test_active_replacement_none_for_non_holder(db_session, seed):
    original, _ = _original_with_giver(db_session, seed, seed.worker_a)
    ReplacementService(db_session).release(original.id, _worker_scope(seed, seed.worker_a), reason=None)
    # worker_b doesn't hold this shift → no pending release from their view.
    assert ReplacementService(db_session).active_replacement_for(
        original.id, _worker_scope(seed, seed.worker_b),
    ) is None


# ── regression: a normal confirmed assignment is still "live" ──────────────────

def test_get_by_request_still_returns_confirmed(db_session, seed):
    original, giver_assignment = _original_with_giver(db_session, seed, seed.worker_a)
    live = AssignmentRepository(db_session).get_by_request(original.id)
    assert live is not None and live.id == giver_assignment.id
