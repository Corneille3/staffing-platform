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
from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo

from app.core.config import settings


def shift_start_utc(work_date: date, start_time: time) -> datetime:
    """The shift's start as an aware UTC datetime, interpreting the stored
    naive wall-clock values in ``settings.shift_timezone``."""
    tz = ZoneInfo(settings.shift_timezone)
    return datetime.combine(work_date, start_time, tzinfo=tz).astimezone(timezone.utc)
