"""Per-user SMS opt-out (SMS reply-to-claim spec, Feature 1 step 1).

`users.sms_opt_out` silences texts for one person — their own toggle, or an
inbound STOP/ARRET once the webhook lands. It silences SMS *only*: email and
push are unaffected, and it outranks the "personal notifications always text"
rule, because a STOP is not a preference we get to weigh against urgency.

conftest pins shift_timezone=UTC; shifts are built relative to utcnow.
"""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.models.enums import RequestRole, RequestStatus, RequestType
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


def _urgent_request(session, seed) -> StaffingRequest:
    """Urgent + imminent: passes the broadcast SMS gate on every axis, so a
    missing text can only be the opt-out."""
    start = datetime.now(timezone.utc) + timedelta(hours=3)
    req = StaffingRequest(
        id=uuid4(), organization_id=seed.org.id, created_by_user_id=seed.org_admin.id,
        request_type=RequestType.URGENT_REPLACEMENT, role=RequestRole.EDUCATOR,
        status=RequestStatus.NOTIFIED, urgency_level=3,
        title='Couverture', city='IntTestCity',
        work_date=start.date(), start_time=start.time().replace(microsecond=0),
        end_time=start.time().replace(microsecond=0),
    )
    session.add(req)
    session.flush()
    return req


def test_default_is_opted_in(db_session, seed):
    """Existing rows keep texting exactly as before — no backfill needed."""
    assert seed.worker_a.sms_opt_out is False


def test_opted_out_worker_gets_no_broadcast_sms(db_session, seed, channels):
    seed.worker_a.phone = '+15145550001'
    seed.worker_a.sms_opt_out = True
    req = _urgent_request(db_session, seed)

    NotificationDispatcher(db_session).notify_workers(req, [seed.worker_a])

    assert channels['sms'] == []
    # Silencing texts must not silence the worker entirely.
    assert len(channels['email']) == 1


def test_opt_out_beats_the_always_texts_rule(db_session, seed, channels):
    """Confirmations and cancellations bypass the broadcast gate, but they do
    not bypass an opt-out — that's the whole point of STOP compliance."""
    seed.worker_a.phone = '+15145550001'
    seed.worker_a.sms_opt_out = True
    req = _urgent_request(db_session, seed)

    dispatcher = NotificationDispatcher(db_session)
    dispatcher.notify_assignment_confirmed(req, seed.worker_a)
    dispatcher.notify_assignment_cancelled(req, seed.worker_a)

    assert channels['sms'] == []
    assert len(channels['email']) == 2


def test_opt_out_is_per_person(db_session, seed, channels):
    seed.worker_a.phone = '+15145550001'
    seed.worker_a.sms_opt_out = True
    seed.worker_b.phone = '+15145550002'
    req = _urgent_request(db_session, seed)

    NotificationDispatcher(db_session).notify_workers(req, [seed.worker_a, seed.worker_b])

    assert [phone for phone, _ in channels['sms']] == ['+15145550002']


def test_worker_can_toggle_their_own_sms_preference(worker_a_client, seed, db_session):
    resp = worker_a_client.patch(
        f'/api/v1/workers/{seed.worker_a.id}/sms-preference',
        json={'sms_opt_out': True},
    )

    assert resp.status_code == 200
    assert resp.json()['sms_opt_out'] is True
    db_session.refresh(seed.worker_a)
    assert seed.worker_a.sms_opt_out is True


def test_worker_cannot_toggle_someone_elses(worker_a_client, seed):
    resp = worker_a_client.patch(
        f'/api/v1/workers/{seed.worker_b.id}/sms-preference',
        json={'sms_opt_out': True},
    )

    assert resp.status_code == 403


def test_toggle_works_without_a_worker_profile(worker_a_client, seed, db_session):
    """The flag lives on the user row precisely so it survives a missing
    profile — an invited-but-not-onboarded worker still has a phone."""
    db_session.delete(seed.worker_a.worker_profile)
    db_session.flush()

    resp = worker_a_client.patch(
        f'/api/v1/workers/{seed.worker_a.id}/sms-preference',
        json={'sms_opt_out': True},
    )

    assert resp.status_code == 200
    db_session.refresh(seed.worker_a)
    assert seed.worker_a.sms_opt_out is True
