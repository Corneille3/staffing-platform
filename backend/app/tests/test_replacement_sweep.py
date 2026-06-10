"""Escalate-then-expire sweep (SELF_SERVE §7, scheduler-wired 2026-06-10).

The tick is exercised directly (the scheduler thread is a trivial loop around
it — see app/scheduler.py). conftest pins shift_timezone to UTC, so tests can
build shift datetimes relative to utcnow; the one America/Toronto test
monkeypatches the setting to prove wall-clock interpretation.
"""
from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select

from app.auth.scope import AccessScope
from app.core.config import settings
from app.core.timeutil import shift_start_utc
from app.models.audit_log import AuditLog
from app.models.enums import (
    RequestOrigin,
    RequestRole,
    RequestStatus,
    RequestType,
)
from app.models.staffing_request import StaffingRequest
from app.notifications import email_service
from app.services.replacement_admin_service import ReplacementAdminService


def _admin_scope(seed) -> AccessScope:
    return AccessScope(user=seed.apf, tenant_id=seed.tenant.id)


def _searching_request(session, seed, *, origin, starts_in: timedelta) -> StaffingRequest:
    """A still-searching self-serve request whose shift starts ``starts_in``
    from now (UTC — the test timezone)."""
    start = datetime.now(timezone.utc) + starts_in
    req = StaffingRequest(
        id=uuid4(), organization_id=seed.org.id, created_by_user_id=seed.worker_a.id,
        request_type=RequestType.URGENT_REPLACEMENT, role=RequestRole.EDUCATOR,
        status=RequestStatus.OPEN, origin=origin, auto_assign=True,
        title='Couverture matin', city='IntTestCity',
        work_date=start.date(), start_time=start.time().replace(microsecond=0),
        end_time=time(23, 59),
    )
    session.add(req)
    session.flush()
    return req


def _capture_emails(monkeypatch) -> list:
    sent: list[email_service.EmailMessage] = []

    def fake_send(self, message):
        sent.append(message)
        return {'channel': 'email', 'delivery_status': 'sent', 'recipient': message.to_email}

    monkeypatch.setattr(email_service.EmailNotificationService, 'send', fake_send)
    return sent


# ── escalation ───────────────────────────────────────────────────────────────

def test_escalation_stamps_audits_and_emails_once(db_session, seed, monkeypatch):
    sent = _capture_emails(monkeypatch)
    req = _searching_request(
        db_session, seed, origin=RequestOrigin.WORKER_REPLACEMENT,
        starts_in=timedelta(minutes=30),  # inside the 60-min lead
    )

    result = ReplacementAdminService(db_session).tick()

    assert result['escalated'] == 1
    db_session.refresh(req)
    assert req.escalated_at is not None
    assert req.status == RequestStatus.OPEN  # still claimable — warned, not closed
    audit = db_session.scalar(select(AuditLog).where(
        AuditLog.action == 'replacement.escalated', AuditLog.entity_id == req.id,
    ))
    assert audit is not None
    assert 0 <= audit.payload['minutes_to_start'] <= 30
    # seed.org_admin is the org's active coordinator
    assert [m.to_email for m in sent] == [seed.org_admin.email]
    assert 'Unfilled shift' in sent[0].subject  # org_admin prefers EN

    # Second pass: stamp prevents a re-email.
    result = ReplacementAdminService(db_session).tick()
    assert result['escalated'] == 0
    assert len(sent) == 1


def test_escalation_covers_staff_absence_and_localizes(db_session, seed, monkeypatch):
    sent = _capture_emails(monkeypatch)
    seed.org_admin.preferred_language = 'fr'
    db_session.flush()
    _searching_request(
        db_session, seed, origin=RequestOrigin.STAFF_ABSENCE,
        starts_in=timedelta(minutes=45),
    )

    assert ReplacementAdminService(db_session).tick()['escalated'] == 1
    assert len(sent) == 1
    assert 'Quart non comblé' in sent[0].subject
    assert 'Absence signalée par Worker Alpha' in sent[0].body


def test_far_future_not_escalated(db_session, seed, monkeypatch):
    sent = _capture_emails(monkeypatch)
    req = _searching_request(
        db_session, seed, origin=RequestOrigin.WORKER_REPLACEMENT,
        starts_in=timedelta(days=3),
    )

    result = ReplacementAdminService(db_session).tick()

    assert result == {'escalated': 0, 'expired': 0}
    db_session.refresh(req)
    assert req.escalated_at is None
    assert sent == []


# ── expiry ───────────────────────────────────────────────────────────────────

def test_expiry_covers_both_origins(db_session, seed, monkeypatch):
    """The original sweep only expired worker_replacement — permanent-staff
    absences sat 'searching' forever. Both self-serve origins expire now."""
    _capture_emails(monkeypatch)
    release = _searching_request(
        db_session, seed, origin=RequestOrigin.WORKER_REPLACEMENT,
        starts_in=timedelta(hours=-2),
    )
    absence = _searching_request(
        db_session, seed, origin=RequestOrigin.STAFF_ABSENCE,
        starts_in=timedelta(hours=-2),
    )

    result = ReplacementAdminService(db_session).tick()

    assert result['expired'] == 2
    for req in (release, absence):
        db_session.refresh(req)
        assert req.status == RequestStatus.EXPIRED


def test_manual_sweep_endpoint_returns_both_counts(apf_client, db_session, seed, monkeypatch):
    _capture_emails(monkeypatch)
    _searching_request(
        db_session, seed, origin=RequestOrigin.STAFF_ABSENCE,
        starts_in=timedelta(hours=-1),
    )

    resp = apf_client.post('/api/v1/admin/replacements/sweep')

    assert resp.status_code == 200
    body = resp.json()
    assert body['expired'] >= 1
    assert 'escalated' in body


# ── coordinator feed covers absences ─────────────────────────────────────────

def test_feed_includes_staff_absence_with_origin(db_session, seed):
    _searching_request(
        db_session, seed, origin=RequestOrigin.STAFF_ABSENCE,
        starts_in=timedelta(days=2),
    )

    feed = ReplacementAdminService(db_session).coordinator_feed(_admin_scope(seed))

    absences = [i for i in feed.items if i.origin == 'staff_absence']
    assert len(absences) == 1
    assert absences[0].giver_name == 'Worker Alpha'
    assert absences[0].status == 'searching'


# ── timezone interpretation ──────────────────────────────────────────────────

def test_shift_start_utc_interprets_quebec_wall_clock(monkeypatch):
    """An 8h00 Montréal shift is 12h00 UTC in July (EDT) — treating it as UTC
    (the old shortcut) would have expired it 4 h early once the scheduler ran."""
    monkeypatch.setattr(settings, 'shift_timezone', 'America/Toronto')

    start = shift_start_utc(date(2026, 7, 1), time(8, 0))

    assert start == datetime(2026, 7, 1, 12, 0, tzinfo=timezone.utc)
