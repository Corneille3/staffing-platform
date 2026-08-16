"""Follow-up hardening on the SMS reply-to-claim feature.

Three edges the first pass left open:
- a late "1" must not claim a shift already underway;
- workers who ACCEPTED (raised a hand) get one closure SMS when the shift
  goes to someone else — passive recipients stay push-only;
- the webhook drops (200, empty TwiML) messages beyond the per-sender rate,
  so a replay flood can't spray claims or receipts.
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
from app.models.inbound_sms import InboundSms
from app.models.request_response import RequestResponse
from app.models.staffing_request import StaffingRequest
from app.services.inbound_sms_service import InboundSmsService

PHONE = '+15145550001'


def _open_replacement(session, seed, giver, *, work_date=None, start=time(8, 0)) -> StaffingRequest:
    original = StaffingRequest(
        id=uuid4(), organization_id=seed.org.id, created_by_user_id=giver.id,
        request_type=RequestType.URGENT_REPLACEMENT, role=RequestRole.EDUCATOR,
        status=RequestStatus.ASSIGNED, origin=RequestOrigin.COORDINATOR,
        title='Couverture', city='IntTestCity',
        work_date=work_date or (date.today() + timedelta(days=21)),
        start_time=start, end_time=time(23, 59),
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
        work_date=work_date or (date.today() + timedelta(days=21)),
        start_time=start, end_time=time(23, 59),
    )
    session.add(replacement)
    session.flush()
    return replacement


def _notify(session, request, worker, *, age: timedelta = timedelta(minutes=5)) -> RequestResponse:
    response = RequestResponse(
        id=uuid4(), staffing_request_id=request.id, worker_user_id=worker.id,
        status=ResponseStatus.NOTIFIED,
        created_at=datetime.now(timezone.utc) - age,
    )
    session.add(response)
    session.flush()
    return response


@pytest.fixture
def texter(db_session, seed):
    seed.worker_b.phone = PHONE
    db_session.flush()
    return seed.worker_b


# ── started shifts are not claimable by SMS ─────────────────────────────────

def test_reply_cannot_claim_a_shift_already_underway(db_session, seed, texter):
    """A 07:10 reply to a 06:45 shift must not assign a room in progress."""
    started = _open_replacement(
        db_session, seed, seed.worker_a,
        work_date=date.today() - timedelta(days=1), start=time(0, 1),
    )
    _notify(db_session, started, texter, age=timedelta(hours=1))

    reply = InboundSmsService(db_session).handle(PHONE, '1')

    assert 'No open shift' in reply or 'Aucun quart' in reply
    assert db_session.get(StaffingRequest, started.id).status == RequestStatus.OPEN


def test_started_candidate_falls_through_to_next_future_shift(db_session, seed, texter):
    """Skipped, not fatal: the newest text points at a started shift, but a
    slightly older text points at a future one — the reply should take the
    future shift rather than come back empty."""
    started = _open_replacement(
        db_session, seed, seed.worker_a,
        work_date=date.today() - timedelta(days=1), start=time(0, 1),
    )
    future = _open_replacement(db_session, seed, seed.worker_a)
    _notify(db_session, started, texter, age=timedelta(minutes=2))   # newest → started
    _notify(db_session, future, texter, age=timedelta(minutes=30))   # older → future

    reply = InboundSmsService(db_session).handle(PHONE, '1')

    assert "You're in" in reply or "C'est a toi" in reply
    assert db_session.get(StaffingRequest, future.id).status == RequestStatus.ASSIGNED
    assert db_session.get(StaffingRequest, started.id).status == RequestStatus.OPEN


# ── closure SMS for raised hands ────────────────────────────────────────────

def test_accepted_loser_gets_one_closure_sms(db_session, seed, texter, monkeypatch):
    """ACCEPTED = they committed and are waiting; they get told by text.
    NOTIFIED bystanders stay push-only."""
    sent: list[tuple[str, str]] = []
    from app.notifications import notification_dispatcher as nd
    monkeypatch.setattr(
        nd.SmsNotificationService, 'send',
        lambda self, phone, body: sent.append((phone, body)) or {'delivery_status': 'sent'},
    )

    request = _open_replacement(db_session, seed, seed.worker_a)
    # texter raised a hand; worker_c was merely notified
    hand = _notify(db_session, request, texter)
    hand.status = ResponseStatus.ACCEPTED
    from app.models.user import User
    from app.models.enums import UserRole
    bystander = User(
        id=uuid4(), clerk_user_id=f'int-bystander-{uuid4().hex[:8]}', role=UserRole.WORKER,
        email=f'bystander-{uuid4().hex[:6]}@test.local', first_name='By', last_name='Stander',
        phone='+15145550002',
    )
    db_session.add(bystander)
    db_session.flush()
    _notify(db_session, request, bystander)
    db_session.flush()

    winner = seed.worker_a
    nd.NotificationDispatcher(db_session).notify_request_filled(request, winner.id)

    numbers = [phone for phone, _ in sent]
    assert PHONE in numbers, 'the raised hand must get a closure text'
    assert '+15145550002' not in numbers, 'bystanders stay push-only'
    assert any('someone else' in body or 'quelqu' in body for _, body in sent)


def test_accepted_loser_with_opt_out_gets_no_sms(db_session, seed, texter, monkeypatch):
    sent = []
    from app.notifications import notification_dispatcher as nd
    monkeypatch.setattr(
        nd.SmsNotificationService, 'send',
        lambda self, phone, body: sent.append(phone) or {'delivery_status': 'sent'},
    )
    texter.sms_opt_out = True
    request = _open_replacement(db_session, seed, seed.worker_a)
    hand = _notify(db_session, request, texter)
    hand.status = ResponseStatus.ACCEPTED
    db_session.flush()

    nd.NotificationDispatcher(db_session).notify_request_filled(request, seed.worker_a.id)

    assert sent == [], 'STOP means stop, including closure texts'


# ── webhook rate limit ──────────────────────────────────────────────────────

def test_webhook_drops_over_limit_senders_without_processing(db_session, monkeypatch):
    from app.api.v1 import webhooks

    monkeypatch.setattr(webhooks, '_rate_window', __import__('collections').defaultdict(
        __import__('collections').deque))
    limit = webhooks.settings.sms_inbound_per_minute

    flood_number = '+15140009999'
    for _ in range(limit):
        assert webhooks._rate_limited(flood_number) is False
    assert webhooks._rate_limited(flood_number) is True, 'call N+1 inside the window drops'
    # an unrelated sender is unaffected
    assert webhooks._rate_limited('+15140008888') is False


def test_rate_window_slides(monkeypatch):
    from app.api.v1 import webhooks
    from collections import defaultdict, deque

    monkeypatch.setattr(webhooks, '_rate_window', defaultdict(deque))
    clock = {'now': 1000.0}
    monkeypatch.setattr(webhooks, 'monotonic', lambda: clock['now'])

    number = '+15140007777'
    for _ in range(webhooks.settings.sms_inbound_per_minute):
        assert webhooks._rate_limited(number) is False
    assert webhooks._rate_limited(number) is True
    clock['now'] += 61  # a minute later the window has emptied
    assert webhooks._rate_limited(number) is False
