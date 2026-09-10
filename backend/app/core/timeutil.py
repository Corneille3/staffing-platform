"""Shift-time interpretation.

Shift ``work_date``/``start_time`` are stored naive — they are Québec
wall-clock times exactly as coordinators and workers entered them. The
original shortcut treated them as UTC, which skews every "how soon is this
shift" comparison by ~4-5 hours. That was harmless while the replacement
sweep was manual-only, but becomes real the moment a scheduler runs it: an
8h00 shift would expire (and stop being claimable) around 3h00 local, and
the coordinator escalation email would fire in the middle of the night.

All shift-vs-now comparisons must go through this helper. Revisit if
per-org timezones ever land (settings.shift_timezone is global for now).
"""
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from app.core.config import settings


def shift_local_date(moment: datetime) -> date:
    """The calendar date of an aware instant in ``settings.shift_timezone``.
    The only correct way to compare an instant against ``work_date``: taking
    ``.date()`` of a UTC datetime is tomorrow's date between 20:00 and
    midnight in Québec (finding #18, 2026-09-09)."""
    return moment.astimezone(ZoneInfo(settings.shift_timezone)).date()


def shift_today() -> date:
    """Today's calendar date in ``settings.shift_timezone`` — use this, never
    ``date.today()`` or ``datetime.now(timezone.utc).date()``, for anything
    keyed on ``work_date`` (today's roster, coverage windows, same-day rules)."""
    return shift_local_date(datetime.now(timezone.utc))


def shift_midnight_utc(day: date) -> datetime:
    """Local midnight at the start of ``day`` as an aware UTC datetime — the
    boundary to use when bucketing UTC timestamps (``created_at``) by
    Québec calendar day or week."""
    tz = ZoneInfo(settings.shift_timezone)
    return datetime.combine(day, time(), tzinfo=tz).astimezone(timezone.utc)


def shift_start_utc(work_date: date, start_time: time) -> datetime:
    """The shift's start as an aware UTC datetime, interpreting the stored
    naive wall-clock values in ``settings.shift_timezone``."""
    tz = ZoneInfo(settings.shift_timezone)
    return datetime.combine(work_date, start_time, tzinfo=tz).astimezone(timezone.utc)


def shift_end_utc(work_date: date, start_time: time, end_time: time) -> datetime:
    """The shift's end as an aware UTC datetime. ``end_time <= start_time``
    means the shift crosses midnight and ends the next day — the same
    convention the worker UI's duration display uses."""
    tz = ZoneInfo(settings.shift_timezone)
    end_date = work_date if end_time > start_time else work_date + timedelta(days=1)
    return datetime.combine(end_date, end_time, tzinfo=tz).astimezone(timezone.utc)
