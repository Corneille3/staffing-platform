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
