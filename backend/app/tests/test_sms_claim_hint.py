"""The "Reply 1" line in broadcast texts (spec Feature 1 step 3).

This suffix is a promise: reply 1 and you get the shift. These tests exist to
stop us making that promise where it isn't true — on a coordinator-created
request the reply-to-claim path rejects (wrong origin), so the worker would
text 1 and be told no shift is open.

conftest pins shift_timezone=UTC; shifts are built relative to utcnow.
"""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.core.config import settings
from app.models.enums import (
    ReplacementPolicy,
    RequestOrigin,
    RequestRole,
    RequestStatus,
    RequestType,
)
from app.models.staffing_request import StaffingRequest
from app.notifications import email_service, sms_service
from app.notifications.notification_dispatcher import NotificationDispatcher


@pytest.fixture
def channels(monkeypatch):
    sent = {'email': [], 'sms': []}

    def fake_email(self, message):
        sent['email'].append(message)
        return {'channel': 'email', 'delivery_status': 'sent', 'recipient': message.to_email}

    def fake_sms(self, phone_number, body):
        sent['sms'].append((phone_number, body))
        return {'channel': 'sms', 'delivery_status': 'sent', 'phone_number': phone_number}

    monkeypatch.setattr(email_service.EmailNotificationService, 'send', fake_email)
    monkeypatch.setattr(sms_service.SmsNotificationService, 'send', fake_sms)
    return sent


@pytest.fixture
def twilio_on(monkeypatch):
    """Without credentials there is no inbound webhook to answer."""
    monkeypatch.setattr(settings, 'twilio_account_sid', 'AC-test')


def _urgent(session, seed, *, origin: RequestOrigin) -> StaffingRequest:
    start = datetime.now(timezone.utc) + timedelta(hours=3)
    req = StaffingRequest(
        id=uuid4(), organization_id=seed.org.id, created_by_user_id=seed.org_admin.id,
        request_type=RequestType.URGENT_REPLACEMENT, role=RequestRole.EDUCATOR,
        status=RequestStatus.OPEN, origin=origin, urgency_level=3,
        title='Couverture', city='IntTestCity',
        work_date=start.date(), start_time=start.time().replace(microsecond=0),
        end_time=start.time().replace(microsecond=0),
    )
    session.add(req)
    session.flush()
    return req


def _body(channels) -> str:
    assert len(channels['sms']) == 1
    return channels['sms'][0][1]


def test_released_shift_invites_a_reply(db_session, seed, channels, twilio_on):
    seed.worker_a.phone = '+15145550001'
    req = _urgent(db_session, seed, origin=RequestOrigin.WORKER_REPLACEMENT)

    NotificationDispatcher(db_session).notify_workers(req, [seed.worker_a])

    assert 'Reply 1 to take it.' in _body(channels)


def test_reported_absence_invites_a_reply(db_session, seed, channels, twilio_on):
    seed.worker_a.phone = '+15145550001'
    req = _urgent(db_session, seed, origin=RequestOrigin.STAFF_ABSENCE)

    NotificationDispatcher(db_session).notify_workers(req, [seed.worker_a])

    assert 'Reply 1 to take it.' in _body(channels)


def test_coordinator_request_never_promises_a_reply(db_session, seed, channels, twilio_on):
    """The claim path rejects this origin — inviting a reply here would send
    the worker straight into "No open shift for you right now"."""
    seed.worker_a.phone = '+15145550001'
    req = _urgent(db_session, seed, origin=RequestOrigin.COORDINATOR)

    NotificationDispatcher(db_session).notify_workers(req, [seed.worker_a])

    body = _body(channels)
    assert 'Reply 1' not in body
    assert 'Sign in to respond.' in body


def test_managed_org_asks_for_an_offer_not_a_claim(db_session, seed, channels, twilio_on):
    """Under MANAGED a reply raises a hand; the coordinator still decides.
    Saying "take it" would be a lie the worker acts on."""
    seed.org.replacement_policy = ReplacementPolicy.MANAGED
    seed.worker_a.phone = '+15145550001'
    req = _urgent(db_session, seed, origin=RequestOrigin.WORKER_REPLACEMENT)

    NotificationDispatcher(db_session).notify_workers(req, [seed.worker_a])

    body = _body(channels)
    assert 'Reply 1 to offer.' in body
    assert 'take it' not in body


def test_no_reply_invitation_without_twilio_configured(db_session, seed, channels, monkeypatch):
    """Prod ran for months with blank Twilio config — no webhook, so no
    promise. Falls back to the sign-in wording."""
    monkeypatch.setattr(settings, 'twilio_account_sid', '')
    seed.worker_a.phone = '+15145550001'
    req = _urgent(db_session, seed, origin=RequestOrigin.WORKER_REPLACEMENT)

    NotificationDispatcher(db_session).notify_workers(req, [seed.worker_a])

    body = _body(channels)
    assert 'Reply 1' not in body
    assert 'Sign in to respond.' in body


def test_claim_hint_stays_gsm7(db_session, seed, channels, twilio_on):
    """One non-GSM character re-encodes the whole message as UCS-2 and
    doubles the per-segment price."""
    seed.worker_a.phone = '+15145550001'
    req = _urgent(db_session, seed, origin=RequestOrigin.WORKER_REPLACEMENT)

    NotificationDispatcher(db_session).notify_workers(req, [seed.worker_a])

    body = _body(channels)
    for forbidden in ('—', '–', 'î', 'ô', '’', '“', '”'):
        assert forbidden not in body
