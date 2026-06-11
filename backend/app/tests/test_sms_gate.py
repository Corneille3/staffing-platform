"""Broadcast SMS gate (2026-06-10 decision): texts cost money and attention,
so new-shift broadcasts SMS only when speed matters — urgent (level >= 3) or
the shift starts within sms_broadcast_lead_hours (24). Personal notifications
(assignment confirmed / cancelled) always text.

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
    """Capture both channels; neither test SMTP nor Twilio is ever hit."""
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


def _request(session, seed, *, urgency: int, starts_in: timedelta) -> StaffingRequest:
    start = datetime.now(timezone.utc) + starts_in
    req = StaffingRequest(
        id=uuid4(), organization_id=seed.org.id, created_by_user_id=seed.org_admin.id,
        request_type=RequestType.URGENT_REPLACEMENT, role=RequestRole.EDUCATOR,
        status=RequestStatus.NOTIFIED, urgency_level=urgency,
        title='Couverture', city='IntTestCity',
        work_date=start.date(), start_time=start.time().replace(microsecond=0),
        end_time=start.time().replace(microsecond=0),
    )
    session.add(req)
    session.flush()
    return req


def test_far_future_low_urgency_broadcast_emails_but_no_sms(db_session, seed, channels):
    seed.worker_a.phone = '+15145550001'
    req = _request(db_session, seed, urgency=1, starts_in=timedelta(days=10))

    NotificationDispatcher(db_session).notify_workers(req, [seed.worker_a])

    assert len(channels['email']) == 1
    assert channels['sms'] == []


def test_urgent_broadcast_texts_even_far_out(db_session, seed, channels):
    seed.worker_a.phone = '+15145550001'
    req = _request(db_session, seed, urgency=3, starts_in=timedelta(days=10))

    NotificationDispatcher(db_session).notify_workers(req, [seed.worker_a])

    assert len(channels['sms']) == 1


def test_within_24h_broadcast_texts_even_low_urgency(db_session, seed, channels):
    seed.worker_a.phone = '+15145550001'
    req = _request(db_session, seed, urgency=1, starts_in=timedelta(hours=3))

    NotificationDispatcher(db_session).notify_workers(req, [seed.worker_a])

    assert len(channels['sms']) == 1
    # GSM-7 guard: a single non-GSM char (— î ô) silently doubles the price.
    assert '—' not in channels['sms'][0][1]


def test_worker_without_phone_is_skipped_silently(db_session, seed, channels):
    seed.worker_a.phone = None
    req = _request(db_session, seed, urgency=3, starts_in=timedelta(hours=3))

    NotificationDispatcher(db_session).notify_workers(req, [seed.worker_a])

    assert len(channels['email']) == 1
    assert channels['sms'] == []


def test_assignment_confirmed_always_texts(db_session, seed, channels):
    """Personal notifications bypass the broadcast gate — far-future and
    low-urgency still texts."""
    seed.worker_a.phone = '+15145550001'
    req = _request(db_session, seed, urgency=1, starts_in=timedelta(days=10))

    dispatcher = NotificationDispatcher(db_session)
    dispatcher.notify_assignment_confirmed(req, seed.worker_a)
    dispatcher.notify_assignment_cancelled(req, seed.worker_a)

    assert len(channels['sms']) == 2
    assert all('—' not in body for _, body in channels['sms'])
