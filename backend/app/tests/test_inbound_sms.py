"""Inbound SMS reply-to-claim (spec Feature 1 step 2).

The webhook is another client of ReplacementService.claim — these tests cover
the routing decisions around it (who texted, which shift, which reply), not the
claim atomicity itself, which test_replacement_claim.py already pins.
"""
from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.core.phone import normalize_e164
from app.models.assignment import Assignment
from app.models.enums import (
    AssignmentStatus,
    ReplacementPolicy,
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


# ── fixtures ────────────────────────────────────────────────────────────────

def _open_replacement(session, seed, giver) -> StaffingRequest:
    """A released shift sitting open for anyone to claim."""
    original = StaffingRequest(
        id=uuid4(), organization_id=seed.org.id, created_by_user_id=giver.id,
        request_type=RequestType.URGENT_REPLACEMENT, role=RequestRole.EDUCATOR,
        status=RequestStatus.ASSIGNED, origin=RequestOrigin.COORDINATOR,
        title='Couverture matin', city='IntTestCity',
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
        title='Couverture matin', city='IntTestCity',
        work_date=date.today() + timedelta(days=21),
        start_time=time(8, 0), end_time=time(16, 0),
    )
    session.add(replacement)
    session.flush()
    return replacement


def _notify(session, request, worker, *, age: timedelta = timedelta(minutes=5)) -> RequestResponse:
    """The NOTIFIED row a broadcast leaves behind — what a reply matches on."""
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
    """worker_b with a phone, so worker_a stays available as the giver."""
    seed.worker_b.phone = PHONE
    db_session.flush()
    return seed.worker_b


# ── phone normalization ─────────────────────────────────────────────────────

@pytest.mark.parametrize('raw,expected', [
    ('(514) 555-0001', '+15145550001'),
    ('514-555-0001', '+15145550001'),
    ('1 514 555 0001', '+15145550001'),
    ('+15145550001', '+15145550001'),
    ('5145550001', '+15145550001'),
])
def test_normalize_e164_handles_what_coordinators_type(raw, expected):
    assert normalize_e164(raw) == expected


def test_normalize_leaves_unparseable_input_alone():
    """A number we can't place is a lookup miss, not something to mangle."""
    assert normalize_e164('poste 204') == 'poste 204'
    assert normalize_e164('') is None
    assert normalize_e164(None) is None


# ── matching the sender ─────────────────────────────────────────────────────

def test_unnormalized_stored_phone_does_not_match(db_session, seed):
    """Why migration 0022 and NormalizedPhone both exist.

    Matching compares against the stored value directly (an indexable equality,
    not a per-row regexp). So a row still holding a coordinator's free-text
    formatting matches nothing — which is exactly the silent failure the
    backfill and the write-side normalization are there to prevent.
    """
    seed.worker_b.phone = '(514) 555-0001'
    db_session.flush()
    request = _open_replacement(db_session, seed, seed.worker_a)
    _notify(db_session, request, seed.worker_b)

    reply = InboundSmsService(db_session).handle(PHONE, '1')

    assert 'not recognized' in reply or 'non reconnu' in reply
    assert db_session.get(StaffingRequest, request.id).status == RequestStatus.OPEN


def test_invited_phone_is_stored_normalized(apf_client, seed):
    """New rows must land in E.164 without waiting for another migration."""
    resp = apf_client.post('/api/v1/workers/invite', json={
        'first_name': 'Sophie', 'last_name': 'Lavoie',
        'email': 'sophie.normalize@example.com',
        'phone': '(514) 555-0199',
    })

    assert resp.status_code == 201
    assert resp.json()['phone'] == '+15145550199'


def test_unknown_number_never_leaks_whether_it_exists(db_session, seed):
    reply = InboundSmsService(db_session).handle('+15149999999', '1')

    assert 'not recognized' in reply or 'non reconnu' in reply
    receipt = db_session.scalar(select(InboundSms))
    assert receipt.action == 'unknown_number'
    assert receipt.matched_user_id is None


def test_duplicate_phones_refuse_to_guess(db_session, seed, texter):
    """Two people, one number — assigning the shift to the wrong one is worse
    than dropping the reply."""
    seed.worker_a.phone = PHONE
    db_session.flush()
    request = _open_replacement(db_session, seed, seed.org_admin)
    _notify(db_session, request, texter)

    reply = InboundSmsService(db_session).handle(PHONE, '1')

    assert 'not recognized' in reply or 'non reconnu' in reply
    assert db_session.get(StaffingRequest, request.id).status == RequestStatus.OPEN


# ── claiming ────────────────────────────────────────────────────────────────

def test_reply_1_claims_the_shift(db_session, seed, texter):
    request = _open_replacement(db_session, seed, seed.worker_a)
    _notify(db_session, request, texter)

    reply = InboundSmsService(db_session).handle(PHONE, '1')

    assert "You're in" in reply or "C'est a toi" in reply
    claimed = db_session.get(StaffingRequest, request.id)
    assert claimed.status == RequestStatus.ASSIGNED
    assert claimed.assigned_worker_user_id == texter.id


@pytest.mark.parametrize('token', ['1', 'oui', 'YES', ' y ', 'O'])
def test_claim_tokens_are_forgiving(db_session, seed, texter, token):
    request = _open_replacement(db_session, seed, seed.worker_a)
    _notify(db_session, request, texter)

    InboundSmsService(db_session).handle(PHONE, token)

    assert db_session.get(StaffingRequest, request.id).status == RequestStatus.ASSIGNED


def test_lost_race_is_told_plainly(db_session, seed, texter):
    request = _open_replacement(db_session, seed, seed.worker_a)
    _notify(db_session, request, texter)
    # Someone else got there first.
    request.status = RequestStatus.ASSIGNED
    request.assigned_worker_user_id = seed.worker_a.id
    db_session.flush()

    reply = InboundSmsService(db_session).handle(PHONE, '1')

    # No longer OPEN, so it isn't claimable at all — the worker is told the
    # truth either way.
    assert 'No open shift' in reply or 'Aucun quart' in reply


def test_nothing_open_when_never_notified(db_session, seed, texter):
    _open_replacement(db_session, seed, seed.worker_a)  # open, but not for them

    reply = InboundSmsService(db_session).handle(PHONE, '1')

    assert 'No open shift' in reply or 'Aucun quart' in reply


def test_reply_outside_the_window_claims_nothing(db_session, seed, texter):
    """A reply to last week's text must not take today's shift."""
    request = _open_replacement(db_session, seed, seed.worker_a)
    _notify(db_session, request, texter, age=timedelta(hours=7))

    reply = InboundSmsService(db_session).handle(PHONE, '1')

    assert 'No open shift' in reply or 'Aucun quart' in reply
    assert db_session.get(StaffingRequest, request.id).status == RequestStatus.OPEN


def test_newest_notification_wins(db_session, seed, texter):
    older = _open_replacement(db_session, seed, seed.worker_a)
    _notify(db_session, older, texter, age=timedelta(hours=2))
    newer = _open_replacement(db_session, seed, seed.worker_a)
    _notify(db_session, newer, texter, age=timedelta(minutes=1))

    InboundSmsService(db_session).handle(PHONE, '1')

    assert db_session.get(StaffingRequest, newer.id).status == RequestStatus.ASSIGNED
    assert db_session.get(StaffingRequest, older.id).status == RequestStatus.OPEN


# ── managed orgs ────────────────────────────────────────────────────────────

def test_managed_org_records_acceptance_without_assigning(db_session, seed, texter):
    seed.org.replacement_policy = ReplacementPolicy.MANAGED
    request = _open_replacement(db_session, seed, seed.worker_a)
    _notify(db_session, request, texter)

    reply = InboundSmsService(db_session).handle(PHONE, '1')

    assert 'pending coordinator' in reply or 'attente du coordonnateur' in reply
    assert db_session.get(StaffingRequest, request.id).assigned_worker_user_id is None
    response = db_session.scalar(
        select(RequestResponse).where(RequestResponse.worker_user_id == texter.id)
    )
    assert response.status == ResponseStatus.ACCEPTED


# ── STOP / START ────────────────────────────────────────────────────────────

@pytest.mark.parametrize('token', ['STOP', 'stop', 'arret', 'arrêt', 'unsubscribe'])
def test_stop_opts_out(db_session, seed, texter, token):
    reply = InboundSmsService(db_session).handle(PHONE, token)

    db_session.refresh(texter)
    assert texter.sms_opt_out is True
    assert 'no more texts' in reply or 'plus de textos' in reply


def test_start_opts_back_in(db_session, seed, texter):
    texter.sms_opt_out = True
    db_session.flush()

    InboundSmsService(db_session).handle(PHONE, 'START')

    db_session.refresh(texter)
    assert texter.sms_opt_out is False


def test_stop_wins_over_a_claimable_shift(db_session, seed, texter):
    """STOP is not a preference to weigh — it stops, even mid-offer."""
    request = _open_replacement(db_session, seed, seed.worker_a)
    _notify(db_session, request, texter)

    InboundSmsService(db_session).handle(PHONE, 'STOP')

    db_session.refresh(texter)
    assert texter.sms_opt_out is True
    assert db_session.get(StaffingRequest, request.id).status == RequestStatus.OPEN


# ── anything else ───────────────────────────────────────────────────────────

def test_unrecognized_text_gets_help(db_session, seed, texter):
    reply = InboundSmsService(db_session).handle(PHONE, 'what shift?')

    assert 'Reply 1' in reply or 'Reponds 1' in reply


def test_every_inbound_leaves_a_receipt(db_session, seed, texter):
    request = _open_replacement(db_session, seed, seed.worker_a)
    _notify(db_session, request, texter)

    InboundSmsService(db_session).handle(PHONE, '1', message_sid='SM123')

    receipt = db_session.scalar(select(InboundSms))
    assert receipt.action == 'claimed'
    assert receipt.matched_user_id == texter.id
    assert receipt.staffing_request_id == request.id
    assert receipt.body == '1'
    assert receipt.message_sid == 'SM123'
