"""Double-booking guard — one human, one place.

Covers the three layers: the 409 at coordinator assign, the 409 at the
self-serve claim (including the giver-still-holds-it window), and the
'Already booked' eligibility reason that keeps committed workers out of
broadcasts and reach counts. Midnight-crossing shifts use the timeutil
convention (end_time <= start_time → ends next day).
"""
from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException

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
from app.models.staffing_request import StaffingRequest
from app.schemas.assignment import AssignmentCreate
from app.services.assignment_service import AssignmentService
from app.services.matching_service import MatchingService
from app.services.replacement_service import ReplacementService
from app.services.response_service import ResponseService

WORK_DATE = date.today() + timedelta(days=21)


def _worker_scope(seed, worker) -> AccessScope:
    return AccessScope(user=worker, tenant_id=seed.tenant.id)


def _make_request(
    session, seed, *,
    status=RequestStatus.OPEN,
    work_date=WORK_DATE,
    start=time(8, 0),
    end=time(16, 0),
    origin=RequestOrigin.COORDINATOR,
) -> StaffingRequest:
    req = StaffingRequest(
        id=uuid4(), organization_id=seed.org.id, created_by_user_id=seed.org_admin.id,
        request_type=RequestType.URGENT_REPLACEMENT, role=RequestRole.EDUCATOR,
        status=status, origin=origin, auto_assign=origin != RequestOrigin.COORDINATOR,
        title='Quart de test', city='IntTestCity',
        work_date=work_date, start_time=start, end_time=end,
    )
    session.add(req)
    session.flush()
    return req


def _confirmed_assignment(session, request_id, worker_id) -> Assignment:
    a = Assignment(
        id=uuid4(), staffing_request_id=request_id, worker_user_id=worker_id,
        assigned_by_user_id=worker_id, status=AssignmentStatus.CONFIRMED,
        assigned_at=datetime.now(timezone.utc), confirmed_at=datetime.now(timezone.utc),
    )
    session.add(a)
    session.flush()
    return a


def _book(session, seed, worker, *, start=time(8, 0), end=time(16, 0), work_date=WORK_DATE):
    """Give the worker a confirmed assignment on its own request."""
    held = _make_request(
        session, seed, status=RequestStatus.ASSIGNED,
        work_date=work_date, start=start, end=end,
    )
    return held, _confirmed_assignment(session, held.id, worker.id)


def _assign(session, seed, request, worker):
    """The coordinator flow: worker accepts, coordinator assigns."""
    ResponseService(session).set_status(request.id, worker.id, ResponseStatus.ACCEPTED)
    return AssignmentService(session).assign(AssignmentCreate(
        staffing_request_id=request.id,
        worker_user_id=worker.id,
        assigned_by_user_id=seed.org_admin.id,
    ))


# ── coordinator assign ──────────────────────────────────────────────────────────

def test_assign_rejects_overlapping_confirmed_shift(db_session, seed):
    _book(db_session, seed, seed.worker_b)  # 8–16
    other = _make_request(db_session, seed, start=time(10, 0), end=time(14, 0))
    with pytest.raises(HTTPException) as exc:
        _assign(db_session, seed, other, seed.worker_b)
    assert exc.value.status_code == 409
    assert 'overlapping' in exc.value.detail


def test_assign_allows_back_to_back_shifts(db_session, seed):
    _book(db_session, seed, seed.worker_b, start=time(8, 0), end=time(12, 0))
    afternoon = _make_request(db_session, seed, start=time(12, 0), end=time(16, 0))
    created = _assign(db_session, seed, afternoon, seed.worker_b)
    assert created.status == AssignmentStatus.CONFIRMED  # touching ≠ overlapping


def test_assign_allows_after_conflict_cancelled(db_session, seed):
    _, held_assignment = _book(db_session, seed, seed.worker_b)
    held_assignment.status = AssignmentStatus.CANCELLED
    db_session.flush()
    other = _make_request(db_session, seed, start=time(10, 0), end=time(14, 0))
    created = _assign(db_session, seed, other, seed.worker_b)
    assert created.status == AssignmentStatus.CONFIRMED


def test_assign_overnight_shift_conflicts_across_midnight(db_session, seed):
    # 22:00–06:00 crosses into the next day (timeutil convention)…
    _book(db_session, seed, seed.worker_b, start=time(22, 0), end=time(6, 0))
    next_morning = _make_request(
        db_session, seed, work_date=WORK_DATE + timedelta(days=1),
        start=time(5, 0), end=time(9, 0),
    )
    with pytest.raises(HTTPException) as exc:
        _assign(db_session, seed, next_morning, seed.worker_b)
    assert exc.value.status_code == 409

    # …but a shift starting exactly at its 06:00 end does not conflict.
    after = _make_request(
        db_session, seed, work_date=WORK_DATE + timedelta(days=1),
        start=time(6, 0), end=time(9, 0),
    )
    created = _assign(db_session, seed, after, seed.worker_b)
    assert created.status == AssignmentStatus.CONFIRMED


# ── self-serve claim ────────────────────────────────────────────────────────────

def _release_scenario(db_session, seed):
    """org_admin holds a shift and releases it (auto policy → OPEN, claimable)."""
    held, _ = _book(db_session, seed, seed.org_admin)
    held.origin = RequestOrigin.COORDINATOR
    return ReplacementService(db_session).release(
        held.id, _worker_scope(seed, seed.org_admin), reason='sick',
    )


def test_claim_rejects_overlapping_shift(db_session, seed):
    replacement = _release_scenario(db_session, seed)
    _book(db_session, seed, seed.worker_b, start=time(10, 0), end=time(14, 0))
    with pytest.raises(HTTPException) as exc:
        ReplacementService(db_session).claim(replacement.id, seed.worker_b.id, seed.tenant.id)
    assert exc.value.status_code == 409
    assert 'overlaps' in exc.value.detail
    db_session.refresh(replacement)
    assert replacement.status == RequestStatus.OPEN  # still claimable by others


def test_claim_succeeds_when_no_overlap(db_session, seed):
    replacement = _release_scenario(db_session, seed)
    # worker_b busy at a non-overlapping hour that day.
    _book(db_session, seed, seed.worker_b, start=time(17, 0), end=time(21, 0))
    assignment = ReplacementService(db_session).claim(
        replacement.id, seed.worker_b.id, seed.tenant.id,
    )
    assert assignment.worker_user_id == seed.worker_b.id


def test_claim_endpoint_double_tap_still_idempotent(db_session, seed, worker_b_client):
    # The winner's own new assignment must not read as a conflict on re-tap
    # (exclude_request_id), nor fail the route's eligibility re-check.
    replacement = _release_scenario(db_session, seed)
    first = worker_b_client.post(f'/api/v1/requests/{replacement.id}/claim')
    assert first.status_code == 200, first.text
    again = worker_b_client.post(f'/api/v1/requests/{replacement.id}/claim')
    assert again.status_code == 200, again.text
    assert again.json()['id'] == first.json()['id']


# ── eligibility ('Already booked') ──────────────────────────────────────────────

def test_booked_worker_ineligible_with_reason(db_session, seed):
    _book(db_session, seed, seed.worker_b)
    other = _make_request(db_session, seed, start=time(9, 0), end=time(13, 0))
    matcher = MatchingService(db=db_session)

    booked = matcher.eligibility_result(other, seed.worker_b)
    assert booked.eligible is False
    assert any(r.label == 'Already booked' for r in booked.reasons)

    free = matcher.eligibility_result(other, seed.worker_a)
    assert free.eligible is True

    pool = matcher.eligible_workers(other, [seed.worker_a, seed.worker_b])
    assert seed.worker_a in pool and seed.worker_b not in pool


def test_giver_blocked_until_release_claimed_then_freed(db_session, seed):
    # worker_a releases a held 8–16 shift: until someone claims it, they still
    # hold it — no grabbing another shift at the same time (anti-gaming).
    held, held_assignment = _book(db_session, seed, seed.worker_a)
    replacement = ReplacementService(db_session).release(
        held.id, _worker_scope(seed, seed.worker_a), reason='sick',
    )
    same_window = _make_request(db_session, seed, start=time(9, 0), end=time(13, 0))
    matcher = MatchingService(db=db_session)
    assert matcher.eligibility_result(same_window, seed.worker_a).eligible is False

    # worker_b claims → the giver's original assignment is RELEASED → freed.
    ReplacementService(db_session).claim(replacement.id, seed.worker_b.id, seed.tenant.id)
    db_session.refresh(held_assignment)
    assert held_assignment.status == AssignmentStatus.RELEASED
    assert matcher.eligibility_result(same_window, seed.worker_a).eligible is True
