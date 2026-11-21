"""In-process background scheduler — the app's heartbeat.

Until 2026-06-10 the app only acted on clicks; nothing watched the clock, so
an unfilled self-serve release was discovered only if a coordinator happened
to look. This daemon thread is the decision (no new infra, no new deps) that
closes that hole. Its jobs:

  - **replacement sweep** (every ``replacement_sweep_interval_seconds``):
    escalate-then-expire still-searching releases/absences across ALL orgs
    (``ReplacementAdminService.tick``) — warns coordinators ~60 min before an
    uncovered shift, expires past-start ones.
  - **reliability recompute** (nightly at ``reliability_recompute_hour_utc``):
    the cron ``WorkerService.recompute_reliability_all`` was always meant to
    have.
  - **lead reminder** (daily from ``lead_reminder_hour_local``): one email to
    the owner and the marketing operators listing the leads whose next action
    is due, the pilots past their end and the invitations left for a week
    (``LeadReminderService.tick``).

Safety model: the docker entrypoint runs uvicorn with no ``--workers`` flag —
a single process — so exactly one scheduler runs per container, and prod runs
one container. If the backend ever scales horizontally, wrap the tick in a
Postgres advisory lock before fanning out. The thread is a daemon and also
stopped explicitly on lifespan shutdown; each tick uses its own session and
swallows (logs) every exception — a bad tick must never kill the heartbeat.
"""
import logging
import threading
from datetime import date, datetime, timezone

from app.core.config import settings
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)

# Let the app finish booting (and, on deploy, migrations settle) before the
# first pass; after downtime the first tick catches up whatever was missed.
_INITIAL_DELAY_SECONDS = 10.0


class BackgroundScheduler:
    def __init__(self) -> None:
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._last_reliability_date: date | None = None

    def start(self) -> None:
        if self._thread is not None:
            return
        # §B1: the check-in grace is the worker's window to act on the
        # reminder before the no-show alert fires — never let it collapse.
        if settings.checkin_grace_minutes < 5:
            raise ValueError(
                'checkin_grace_minutes must be >= 5 '
                f'(got {settings.checkin_grace_minutes})'
            )
        # Initialize to today: the first nightly recompute happens tomorrow,
        # not in a burst at every deploy-time boot.
        self._last_reliability_date = datetime.now(timezone.utc).date()
        self._thread = threading.Thread(
            target=self._loop, name='staffig-scheduler', daemon=True,
        )
        self._thread.start()
        logger.info(
            'Scheduler started: sweep every %ss, escalation lead %s min, '
            'reliability recompute at %02d:00 UTC',
            settings.replacement_sweep_interval_seconds,
            settings.replacement_escalation_lead_minutes,
            settings.reliability_recompute_hour_utc,
        )

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=5)
            self._thread = None

    # ── loop ────────────────────────────────────────────────────────────────

    def _loop(self) -> None:
        if self._stop.wait(_INITIAL_DELAY_SECONDS):
            return
        while True:
            self._run_sweep()
            self._run_attendance_sweep()
            self._maybe_run_reliability()
            self._maybe_run_lead_reminder()
            if self._stop.wait(settings.replacement_sweep_interval_seconds):
                return

    def _run_sweep(self) -> None:
        try:
            # Local import: the service module pulls in the whole model graph,
            # which must not happen as an import side effect of app startup.
            from app.services.replacement_admin_service import ReplacementAdminService

            with SessionLocal() as db:
                result = ReplacementAdminService(db).tick()
            if result['escalated'] or result['expired']:
                logger.info(
                    'Replacement sweep: escalated=%s expired=%s',
                    result['escalated'], result['expired'],
                )
        except Exception:
            logger.exception('Replacement sweep failed')

    def _run_attendance_sweep(self) -> None:
        try:
            from app.services.attendance_sweep_service import AttendanceSweepService

            with SessionLocal() as db:
                result = AttendanceSweepService(db).tick()
            if any(result.values()):
                logger.info('Attendance sweep: %s', result)
        except Exception:
            logger.exception('Attendance sweep failed')

    def _maybe_run_reliability(self) -> None:
        now = datetime.now(timezone.utc)
        if (
            now.hour < settings.reliability_recompute_hour_utc
            or self._last_reliability_date == now.date()
        ):
            return
        try:
            from app.services.worker_service import WorkerService

            with SessionLocal() as db:
                count = WorkerService(db).recompute_reliability_all()
            self._last_reliability_date = now.date()
            logger.info('Nightly reliability recompute: %s workers', count)
        except Exception:
            # Date marker not advanced — retried on the next tick.
            logger.exception('Reliability recompute failed')

    def _maybe_run_lead_reminder(self) -> None:
        # The service decides whether it is time: its "sent today" stamp lives
        # in the database, so a deploy-time restart does not send twice.
        try:
            from app.services.platform_lead_reminder import LeadReminderService

            with SessionLocal() as db:
                result = LeadReminderService(db).tick()
            if result['ran']:
                logger.info(
                    'Lead reminder: %s due, %s pilots past their end, %s stale invites, %s emailed',
                    result['leads'], result['pilots'], result['invites'], result['emailed'],
                )
        except Exception:
            logger.exception('Lead reminder failed')


scheduler = BackgroundScheduler()
