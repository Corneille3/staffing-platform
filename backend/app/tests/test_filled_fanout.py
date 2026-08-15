"""Post-fill "shift filled" push fan-out.

When someone takes a shift, everyone else who was offered it should learn it's
gone without having to open the app or reply and be turned away. Push only —
a StaffiG text must keep meaning opportunity.

Matters more since broadcasts started inviting an SMS reply: the whole pool
races, so more people finish second.
"""
from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4

import pytest

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
from app.notifications import web_push_service
from app.services.replacement_service import ReplacementService


@pytest.fixture
def pushes(monkeypatch):
    """Capture push sends per user."""
    sent = []

    def fake_push(self, db, user_id, payload):
        sent.append((user_id, payload))
        return {'sent': 1, 'pruned': 0, 'failed': 0}

    monkeypatch.setattr(web_push_service.WebPushService, 'send_to_user', fake_push)
    return sent


def _released_shift(session, seed, giver) -> StaffingRequest:
    original = StaffingRequest(
        id=uuid4(), organization_id=seed.org.id, created_by_user_id=giver.id,
        request_type=RequestType.URGENT_REPLACEMENT, role=RequestRole.EDUCATOR,
        status=RequestStatus.ASSIGNED, origin=RequestOrigin.COORDINATOR,
        title='Couverture', city='IntTestCity',
        work_date=date.today() + timedelta(days=21),
        start_time=time(8, 0), end_time=time(16, 0),
    )
    session.add(original)
    session.flush()
    held = Assignment(
        id=uuid4(), staffing_request_id=original.id, worker_user_id=giver.id,
        assigned_by_user_id=giver.id, status=AssignmentStatus.CONFIRMED,
        assigned_at=datetime.now(timezone.utc), confirmed_at=datetime.now(timezone.utc),
    )
    session.add(held)
    session.flush()
    replacement = StaffingRequest(
        id=uuid4(), organization_id=seed.org.id, created_by_user_id=giver.id,
        request_type=RequestType.URGENT_REPLACEMENT, role=RequestRole.EDUCATOR,
        status=RequestStatus.OPEN, origin=RequestOrigin.WORKER_REPLACEMENT,
        auto_assign=True, replaces_assignment_id=held.id,
        title='Couverture', city='IntTestCity',
        work_date=date.today() + timedelta(days=21),
        start_time=time(8, 0), end_time=time(16, 0),
    )
    session.add(replacement)
    session.flush()
    return replacement


def _offered_to(session, request, worker, status=ResponseStatus.NOTIFIED) -> RequestResponse:
    response = RequestResponse(
        id=uuid4(), staffing_request_id=request.id, worker_user_id=worker.id,
        status=status, created_at=datetime.now(timezone.utc),
    )
    session.add(response)
    session.flush()
    return response


def test_losers_are_told_the_shift_is_filled(db_session, seed, pushes):
    request = _released_shift(db_session, seed, seed.org_admin)
    _offered_to(db_session, request, seed.worker_a)
    _offered_to(db_session, request, seed.worker_b)

    ReplacementService(db_session).claim(
        request_id=request.id, claimer_user_id=seed.worker_a.id, tenant_id=seed.tenant.id,
    )

    filled = [(uid, p) for uid, p in pushes if p.get('title') in ('Shift filled', 'Quart comblé')]
    assert [uid for uid, _ in filled] == [seed.worker_b.id]


def test_the_winner_is_not_told_they_lost(db_session, seed, pushes):
    request = _released_shift(db_session, seed, seed.org_admin)
    _offered_to(db_session, request, seed.worker_a)

    ReplacementService(db_session).claim(
        request_id=request.id, claimer_user_id=seed.worker_a.id, tenant_id=seed.tenant.id,
    )

    assert not [p for _, p in pushes if p.get('title') in ('Shift filled', 'Quart comblé')]


def test_workers_who_declined_are_left_alone(db_session, seed, pushes):
    """They already opted out of this shift — telling them it filled is noise
    about a thing they walked away from."""
    request = _released_shift(db_session, seed, seed.org_admin)
    _offered_to(db_session, request, seed.worker_a)
    _offered_to(db_session, request, seed.worker_b, status=ResponseStatus.DECLINED)

    ReplacementService(db_session).claim(
        request_id=request.id, claimer_user_id=seed.worker_a.id, tenant_id=seed.tenant.id,
    )

    assert not [p for _, p in pushes if p.get('title') in ('Shift filled', 'Quart comblé')]


def test_filled_push_replaces_the_original_offer_banner(db_session, seed, pushes):
    """Same tag as the "New coverage" push, so a phone showing the offer
    swaps it in place instead of stacking two notices about one shift."""
    request = _released_shift(db_session, seed, seed.org_admin)
    _offered_to(db_session, request, seed.worker_b)

    ReplacementService(db_session).claim(
        request_id=request.id, claimer_user_id=seed.worker_a.id, tenant_id=seed.tenant.id,
    )

    filled = [p for _, p in pushes if p.get('title') in ('Shift filled', 'Quart comblé')]
    assert filled[0]['tag'] == f'request-{request.id}'


def test_a_failing_push_does_not_undo_the_claim(db_session, seed, monkeypatch):
    """The shift is already won and committed; a notification problem must not
    take it back."""
    def boom(self, db, user_id, payload):
        raise RuntimeError('push service down')

    monkeypatch.setattr(web_push_service.WebPushService, 'send_to_user', boom)
    request = _released_shift(db_session, seed, seed.org_admin)
    _offered_to(db_session, request, seed.worker_b)

    ReplacementService(db_session).claim(
        request_id=request.id, claimer_user_id=seed.worker_a.id, tenant_id=seed.tenant.id,
    )

    claimed = db_session.get(StaffingRequest, request.id)
    assert claimed.status == RequestStatus.ASSIGNED
    assert claimed.assigned_worker_user_id == seed.worker_a.id
