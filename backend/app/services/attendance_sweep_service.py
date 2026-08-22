"""Attendance sweep — clock-in/out reminders (SPEC_NOSHOW §B; §A rides later).

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
from app.notifications.web_push_service import WebPushService

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
        result = {'checkin_reminders': 0, 'checkout_reminders': 0}
        try:
            result['checkin_reminders'] = self._checkin_reminders(now)
        except Exception:  # pragma: no cover — never let one check kill the tick
            logger.exception('Check-in reminder pass failed')
        try:
            result['checkout_reminders'] = self._checkout_reminders(now)
        except Exception:  # pragma: no cover
            logger.exception('Check-out reminder pass failed')
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
