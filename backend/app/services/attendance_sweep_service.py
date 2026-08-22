"""Attendance sweep — clock-in/out reminders (§B) and no-show alerts (§A).

Rides the same scheduler tick as the replacement sweep. Push-only by design:
SMS costs money for what is a nudge, and email at shift start is dead on
arrival. A worker with no push subscription simply gets no reminder — the
stamp is still written, because the attempt is the event and retrying a
channel that doesn't exist every tick is a loop.

Safety model mirrors the neighbours: each check wraps its own try/except,
logs and continues — a bad pass must never kill the heartbeat.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.timeutil import shift_end_utc, shift_start_utc
from app.models.assignment import Assignment
from app.models.enums import AssignmentStatus
from app.models.organization import Organization
from app.models.staffing_request import StaffingRequest
from app.models.user import User
from app.notifications.email_service import EmailMessage, EmailNotificationService
from app.notifications.i18n import localized, localized_subject
from app.notifications.sms_service import SmsNotificationService
from app.notifications.web_push_service import WebPushService
from app.repositories.organization_repository import OrganizationRepository

logger = logging.getLogger(__name__)


def _push_lang(worker: User) -> str:
    return 'en' if worker.preferred_language == 'en' else 'fr'


def _push_checkin_reminder(worker: User, org_name: str) -> dict:
    lang = _push_lang(worker)
    return {
        'title': 'Pointage' if lang == 'fr' else 'Check in',
        'body': (
            f'Ton quart au {org_name} est commencé — n\'oublie pas de confirmer ton arrivée.'
            if lang == 'fr'
            else f'Your shift at {org_name} has started — don\'t forget to check in.'
        ),
        # The check-in card lives on the Schedule hero on shift day.
        'url': f'/{lang}/worker/schedule',
        'tag': f'attendance-{worker.id}',
    }


def _push_checkout_reminder(worker: User, org_name: str) -> dict:
    lang = _push_lang(worker)
    return {
        'title': 'Terminé?' if lang == 'fr' else 'Done?',
        'body': (
            f'Terminé au {org_name}? Touche Terminé pour enregistrer tes heures.'
            if lang == 'fr'
            else f'Done at {org_name}? Tap Done to record your hours.'
        ),
        'url': f'/{lang}/worker/schedule',
        'tag': f'attendance-{worker.id}',
    }


class AttendanceSweepService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.push = WebPushService()
        self.sms = SmsNotificationService()
        self.email = EmailNotificationService()

    # Catch-up guard: after downtime the first tick sees stale candidates. A
    # reminder for a shift that started hours ago is noise; the dashboard and
    # CSV already carry those cases.
    @property
    def _freshness(self) -> timedelta:
        return timedelta(
            seconds=2 * settings.replacement_sweep_interval_seconds + 15 * 60,
        )

    def tick(self, now: datetime | None = None) -> dict:
        now = now or datetime.now(timezone.utc)
        result = {'checkin_reminders': 0, 'checkout_reminders': 0, 'no_show_alerts': 0}
        try:
            result['checkin_reminders'] = self._checkin_reminders(now)
        except Exception:  # pragma: no cover — never let one check kill the tick
            logger.exception('Check-in reminder pass failed')
        try:
            result['checkout_reminders'] = self._checkout_reminders(now)
        except Exception:  # pragma: no cover
            logger.exception('Check-out reminder pass failed')
        try:
            result['no_show_alerts'] = self._no_show_alerts(now)
        except Exception:  # pragma: no cover
            logger.exception('No-show alert pass failed')
        return result

    # ── B1: check-in reminder — AT start, not before ─────────────────────────

    def _checkin_reminders(self, now: datetime) -> int:
        rows = self._candidates(
            now,
            Assignment.checked_in_at.is_(None),
            Assignment.checkin_reminder_sent_at.is_(None),
        )
        sent = 0
        for assignment, request, worker, org_name in rows:
            start = shift_start_utc(request.work_date, request.start_time)
            if not (start <= now <= start + self._freshness):
                continue
            self.push.send_to_user(
                self.db, worker.id, _push_checkin_reminder(worker, org_name),
            )
            assignment.checkin_reminder_sent_at = now
            sent += 1
        if sent:
            self.db.commit()
        return sent

    # ── B2: check-out reminder — end + delay ─────────────────────────────────

    def _checkout_reminders(self, now: datetime) -> int:
        rows = self._candidates(
            now,
            Assignment.checked_in_at.is_not(None),
            Assignment.checked_out_at.is_(None),
            Assignment.checkout_reminder_sent_at.is_(None),
        )
        delay = timedelta(minutes=settings.checkout_reminder_delay_minutes)
        sent = 0
        for assignment, request, worker, org_name in rows:
            due = shift_end_utc(request.work_date, request.start_time, request.end_time) + delay
            if not (due <= now <= due + self._freshness):
                continue
            self.push.send_to_user(
                self.db, worker.id, _push_checkout_reminder(worker, org_name),
            )
            assignment.checkout_reminder_sent_at = now
            sent += 1
        if sent:
            self.db.commit()
        return sent

    # ── A: coordinator no-show alert — start + grace, worker still absent ────

    def _no_show_alerts(self, now: datetime) -> int:
        """The dashboard's not-checked-in condition, made active (§A). Because
        B1 fired at start and the grace is >= 5 min, every alert here survived
        a reminder — it is signal. SMS + email to the org's active admins: SMS
        because it is the only real-time channel admins have today (no admin
        push UI yet — see spec backlog), email always. A later check-in does
        not retract the alert; the dashboard count self-heals as before."""
        rows = self._candidates(
            now,
            Assignment.checked_in_at.is_(None),
            Assignment.no_show_alerted_at.is_(None),
        )
        grace = timedelta(minutes=settings.checkin_grace_minutes)
        alerted = 0
        for assignment, request, worker, org_name in rows:
            due = shift_start_utc(request.work_date, request.start_time) + grace
            if not (due <= now <= due + self._freshness):
                continue
            self._alert_admins(request, worker, org_name, now)
            assignment.no_show_alerted_at = now
            alerted += 1
        if alerted:
            self.db.commit()
        return alerted

    def _alert_admins(self, request: StaffingRequest, worker: User,
                      org_name: str, now: datetime) -> None:
        admins = OrganizationRepository(self.db).active_admins(request.organization_id)
        if not admins:
            logger.warning('No active coordinator to alert for request %s', request.id)
            return

        worker_name = f'{worker.first_name} {worker.last_name}'.strip()
        role_label = request.role.value if request.role else ''
        start = shift_start_utc(request.work_date, request.start_time)
        minutes = max(0, int((now - start).total_seconds() // 60))
        line_fr = (
            f"{worker_name} n'a pas confirmé son arrivée — {role_label} au "
            f"{org_name}, quart commencé il y a {minutes} min."
        )
        line_en = (
            f"{worker_name} hasn't checked in — {role_label} at {org_name}, "
            f"shift started {minutes} min ago."
        )
        portal = (
            settings.allowed_origins[0].rstrip('/')
            if settings.allowed_origins else 'http://localhost:3000'
        )
        for admin in admins:
            # SMS first — the real-time half. STOP is STOP for any role.
            if admin.phone and not admin.sms_opt_out:
                try:
                    self.sms.send(admin.phone, localized(
                        admin.preferred_language, line_fr, line_en,
                    ))
                except Exception:  # pragma: no cover — a carrier hiccup never blocks email
                    logger.exception('No-show SMS failed for admin %s', admin.id)
            # Email always — the record half, with the deep link to the two
            # real moves: contact the worker or re-broadcast the shift.
            body_fr = (
                f'Bonjour {admin.first_name},\n\n{line_fr}\n\n'
                f'Contactez la personne ou relancez le bassin depuis la demande :\n'
                f'{portal}/fr/admin/requests/{request.id}\n\n— Staffig'
            )
            body_en = (
                f'Hi {admin.first_name},\n\n{line_en}\n\n'
                f'Reach out to them or re-broadcast the shift from the request:\n'
                f'{portal}/en/admin/requests/{request.id}\n\n— Staffig'
            )
            try:
                self.email.send(EmailMessage(
                    to_email=admin.email,
                    subject=localized_subject(
                        admin.preferred_language,
                        f'Arrivée non confirmée — {worker_name} ({org_name})',
                        f'No check-in — {worker_name} ({org_name})',
                    ),
                    body=localized(admin.preferred_language, body_fr, body_en),
                ))
            except Exception:  # pragma: no cover
                logger.exception('No-show email failed for admin %s', admin.id)

    # ── shared candidate query ───────────────────────────────────────────────

    def _candidates(self, now: datetime, *conditions):
        """CONFIRMED assignments on recent shifts, with request/worker/org.
        The date bound keeps this a small scan; exact trigger moments are
        checked in Python against the freshness window."""
        return self.db.execute(
            select(
                Assignment,
                StaffingRequest,
                User,
                Organization.name,
            )
            .join(StaffingRequest, StaffingRequest.id == Assignment.staffing_request_id)
            .join(User, User.id == Assignment.worker_user_id)
            .join(Organization, Organization.id == StaffingRequest.organization_id)
            .where(
                Assignment.status == AssignmentStatus.CONFIRMED,
                # Yesterday covers midnight-crossing shifts and the freshness
                # window; anything older is out of scope by definition.
                StaffingRequest.work_date >= (now.date() - timedelta(days=1)),
                StaffingRequest.work_date <= now.date(),
                *conditions,
            )
        ).all()
