"""Attendance sweep — clock-in/out reminders (SPEC_NOSHOW §B).

conftest pins shift_timezone to UTC, so shift datetimes are built relative
to utcnow. Pushes are captured by monkeypatching WebPushService.send_to_user;
the service must stamp even when zero devices are subscribed (the attempt is
the event — retrying a channel that doesn't exist every tick is a loop).
"""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import app.services.attendance_sweep_service as sweep_mod
from app.models.assignment import Assignment
from app.models.enums import AssignmentStatus, RequestOrigin, RequestRole, RequestStatus, RequestType
from app.models.staffing_request import StaffingRequest
from app.services.attendance_sweep_service import AttendanceSweepService


def _shift(session, seed, *, started_ago: timedelta, duration=timedelta(hours=8),
           assignment_status=AssignmentStatus.CONFIRMED) -> Assignment:
    """A CONFIRMED assignment whose shift started ``started_ago`` before now."""
    start = datetime.now(timezone.utc) - started_ago
    end = start + duration
    req = StaffingRequest(
        id=uuid4(), organization_id=seed.org.id, created_by_user_id=seed.apf.id,
        request_type=RequestType.URGENT_REPLACEMENT, role=RequestRole.EDUCATOR,
        status=RequestStatus.ASSIGNED, origin=RequestOrigin.COORDINATOR,
        title='Attendance test', city='IntTestCity',
        work_date=start.date(),
        start_time=start.time().replace(microsecond=0),
        end_time=end.time().replace(microsecond=0),
    )
    session.add(req)
    session.flush()
    assignment = Assignment(
        id=uuid4(), staffing_request_id=req.id, worker_user_id=seed.worker_a.id,
        assigned_by_user_id=seed.apf.id, status=assignment_status,
    )
    session.add(assignment)
    session.flush()
    return assignment


def _capture_pushes(monkeypatch) -> list:
    sent: list[tuple] = []

    def fake_send(self, db, user_id, payload):
        sent.append((user_id, payload))
        return {'sent': 1, 'pruned': 0, 'failed': 0}

    monkeypatch.setattr(sweep_mod.WebPushService, 'send_to_user', fake_send)
    return sent


# ── B1: check-in reminder ────────────────────────────────────────────────────

def test_checkin_reminder_fires_once(db_session, seed, monkeypatch):
    sent = _capture_pushes(monkeypatch)
    assignment = _shift(db_session, seed, started_ago=timedelta(minutes=5))

    service = AttendanceSweepService(db_session)
    assert service.tick()['checkin_reminders'] == 1
    db_session.refresh(assignment)
    assert assignment.checkin_reminder_sent_at is not None
    assert len(sent) == 1
    user_id, payload = sent[0]
    assert user_id == seed.worker_a.id
    assert 'check in' in payload['body'] or 'arrivée' in payload['body']

    # Second tick: the stamp holds.
    assert service.tick()['checkin_reminders'] == 0
    assert len(sent) == 1


def test_no_reminder_before_start(db_session, seed, monkeypatch):
    sent = _capture_pushes(monkeypatch)
    assignment = _shift(db_session, seed, started_ago=timedelta(minutes=-30))

    assert AttendanceSweepService(db_session).tick()['checkin_reminders'] == 0
    db_session.refresh(assignment)
    assert assignment.checkin_reminder_sent_at is None
    assert sent == []


def test_no_reminder_after_checkin(db_session, seed, monkeypatch):
    sent = _capture_pushes(monkeypatch)
    assignment = _shift(db_session, seed, started_ago=timedelta(minutes=5))
    assignment.checked_in_at = datetime.now(timezone.utc)
    db_session.flush()

    assert AttendanceSweepService(db_session).tick()['checkin_reminders'] == 0
    assert sent == []


def test_stale_candidate_skipped_without_stamp(db_session, seed, monkeypatch):
    """Fresh boot after downtime: a shift that started 4h ago gets no
    reminder (noise) — and no stamp, so the row simply ages out."""
    sent = _capture_pushes(monkeypatch)
    assignment = _shift(db_session, seed, started_ago=timedelta(hours=4))

    assert AttendanceSweepService(db_session).tick()['checkin_reminders'] == 0
    db_session.refresh(assignment)
    assert assignment.checkin_reminder_sent_at is None
    assert sent == []


def test_pushless_worker_still_stamped(db_session, seed):
    """No subscription → zero sends, but the stamp is written anyway."""
    assignment = _shift(db_session, seed, started_ago=timedelta(minutes=5))

    # Real WebPushService: VAPID unset in tests → skips, returns zeros.
    assert AttendanceSweepService(db_session).tick()['checkin_reminders'] == 1
    db_session.refresh(assignment)
    assert assignment.checkin_reminder_sent_at is not None


# ── B2: check-out reminder ───────────────────────────────────────────────────

def test_checkout_reminder_after_end_plus_delay(db_session, seed, monkeypatch):
    sent = _capture_pushes(monkeypatch)
    assignment = _shift(
        db_session, seed,
        started_ago=timedelta(hours=8, minutes=15), duration=timedelta(hours=8),
    )
    assignment.checked_in_at = datetime.now(timezone.utc) - timedelta(hours=8)
    db_session.flush()

    service = AttendanceSweepService(db_session)
    assert service.tick()['checkout_reminders'] == 1
    db_session.refresh(assignment)
    assert assignment.checkout_reminder_sent_at is not None
    assert len(sent) == 1
    assert 'Done' in sent[0][1]['body'] or 'Terminé' in sent[0][1]['body']

    assert service.tick()['checkout_reminders'] == 0
    assert len(sent) == 1


def test_no_checkout_reminder_cases(db_session, seed, monkeypatch):
    sent = _capture_pushes(monkeypatch)
    # Not checked in → B2 never fires (B1's territory).
    _shift(db_session, seed, started_ago=timedelta(hours=8, minutes=15))
    # Checked in but shift not over long enough (end + delay in the future).
    early = _shift(db_session, seed, started_ago=timedelta(hours=7), duration=timedelta(hours=8))
    early.checked_in_at = datetime.now(timezone.utc) - timedelta(hours=7)
    # Already checked out.
    done = _shift(db_session, seed, started_ago=timedelta(hours=9), duration=timedelta(hours=8))
    done.checked_in_at = datetime.now(timezone.utc) - timedelta(hours=9)
    done.checked_out_at = datetime.now(timezone.utc) - timedelta(hours=1)
    db_session.flush()

    assert AttendanceSweepService(db_session).tick()['checkout_reminders'] == 0
    assert sent == []


# ── cancellation clears the stamps ───────────────────────────────────────────

def test_cancellation_clears_reminder_stamps(db_session, seed, apf_client, monkeypatch):
    _capture_pushes(monkeypatch)
    assignment = _shift(db_session, seed, started_ago=timedelta(minutes=5))
    now = datetime.now(timezone.utc)
    assignment.checkin_reminder_sent_at = now
    assignment.checkout_reminder_sent_at = now
    assignment.no_show_alerted_at = now
    db_session.flush()

    resp = apf_client.post(
        f'/api/v1/assignments/{assignment.id}/cancel',
        json={'reason': 'test cleanup'},
    )
    assert resp.status_code == 200

    db_session.refresh(assignment)
    assert assignment.checkin_reminder_sent_at is None
    assert assignment.checkout_reminder_sent_at is None
    assert assignment.no_show_alerted_at is None


# ── A: no-show alert ─────────────────────────────────────────────────────────

def _capture_alert_channels(monkeypatch) -> tuple[list, list]:
    from app.notifications import email_service, sms_service
    emails: list = []
    texts: list = []

    def fake_email(self, message):
        emails.append(message)
        return {'channel': 'email', 'delivery_status': 'sent', 'recipient': message.to_email}

    def fake_sms(self, phone_number, body):
        texts.append((phone_number, body))
        return {'channel': 'sms', 'delivery_status': 'sent', 'recipient': phone_number}

    monkeypatch.setattr(email_service.EmailNotificationService, 'send', fake_email)
    monkeypatch.setattr(sms_service.SmsNotificationService, 'send', fake_sms)
    return emails, texts


def test_no_show_alert_fires_once_after_grace(db_session, seed, monkeypatch):
    _capture_pushes(monkeypatch)
    emails, texts = _capture_alert_channels(monkeypatch)
    seed.org_admin.phone = '+15145550001'
    db_session.flush()
    grace = timedelta(minutes=16)  # past the 15-min grace
    assignment = _shift(db_session, seed, started_ago=grace)

    service = AttendanceSweepService(db_session)
    assert service.tick()['no_show_alerts'] == 1
    db_session.refresh(assignment)
    assert assignment.no_show_alerted_at is not None
    # SMS + email, both to the org's active admin, actionable content.
    assert len(texts) == 1 and texts[0][0] == '+15145550001'
    assert "hasn't checked in" in texts[0][1]  # org_admin prefers EN
    assert [m.to_email for m in emails] == [seed.org_admin.email]
    assert 'No check-in' in emails[0].subject
    assert f'/en/admin/requests/{assignment.staffing_request_id}' in emails[0].body

    # Stamp holds on the second pass.
    assert service.tick()['no_show_alerts'] == 0
    assert len(emails) == 1 and len(texts) == 1


def test_no_alert_inside_grace_or_after_checkin(db_session, seed, monkeypatch):
    _capture_pushes(monkeypatch)
    emails, texts = _capture_alert_channels(monkeypatch)
    # Inside the grace window — B1's reminder territory, not A's.
    _shift(db_session, seed, started_ago=timedelta(minutes=5))
    # Checked in late but before the sweep looked — no alert.
    arrived = _shift(db_session, seed, started_ago=timedelta(minutes=30))
    arrived.checked_in_at = datetime.now(timezone.utc)
    db_session.flush()

    assert AttendanceSweepService(db_session).tick()['no_show_alerts'] == 0
    assert emails == [] and texts == []


def test_no_show_respects_sms_opt_out_email_still_sent(db_session, seed, monkeypatch):
    """STOP is STOP for any role — but the email record still goes out."""
    _capture_pushes(monkeypatch)
    emails, texts = _capture_alert_channels(monkeypatch)
    seed.org_admin.phone = '+15145550001'
    seed.org_admin.sms_opt_out = True
    db_session.flush()
    _shift(db_session, seed, started_ago=timedelta(minutes=20))

    assert AttendanceSweepService(db_session).tick()['no_show_alerts'] == 1
    assert texts == []
    assert len(emails) == 1


def test_no_show_admin_without_phone_gets_email_only(db_session, seed, monkeypatch):
    _capture_pushes(monkeypatch)
    emails, texts = _capture_alert_channels(monkeypatch)
    seed.org_admin.phone = None
    db_session.flush()
    _shift(db_session, seed, started_ago=timedelta(minutes=20))

    assert AttendanceSweepService(db_session).tick()['no_show_alerts'] == 1
    assert texts == []
    assert len(emails) == 1


def test_b1_then_a_ordering_on_one_assignment(db_session, seed, monkeypatch):
    """Reminder at start, alert at start + grace — one assignment, two ticks
    at two moments."""
    pushes = _capture_pushes(monkeypatch)
    emails, _texts = _capture_alert_channels(monkeypatch)
    assignment = _shift(db_session, seed, started_ago=timedelta(minutes=2))

    service = AttendanceSweepService(db_session)
    first = service.tick()
    assert first['checkin_reminders'] == 1 and first['no_show_alerts'] == 0
    assert len(pushes) == 1 and emails == []

    # Simulate the grace elapsing by ticking with a later "now".
    later = datetime.now(timezone.utc) + timedelta(minutes=20)
    second = service.tick(now=later)
    assert second['no_show_alerts'] == 1
    db_session.refresh(assignment)
    assert assignment.checkin_reminder_sent_at is not None
    assert assignment.no_show_alerted_at is not None
    assert len(emails) == 1
