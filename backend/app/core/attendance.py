"""Derived presence state of an assignment — never stored, so it stays true
as the clock moves. Follow-up to SPEC_NOSHOW (2026-09-12): a confirmed shift
that ends without a check-in used to read "confirmed" forever on every
screen; the only trace was the no-show alert stamp.

States, in shift order:
  upcoming   before the scheduled start
  due        started, no check-in yet (check-in still open until the end)
  on_shift   checked in, not out, check-out still open (end + cutoff)
  unclosed   checked in, never checked out, cutoff passed
  completed  checked out (status COMPLETED or both stamps)
  missed     scheduled end passed with no check-in
None for cancelled / released assignments (nothing to attend).
"""
from __future__ import annotations

from datetime import datetime, timedelta

from app.core.config import settings
from app.core.timeutil import shift_end_utc, shift_start_utc
from app.models.enums import AssignmentStatus

UPCOMING = 'upcoming'
DUE = 'due'
ON_SHIFT = 'on_shift'
UNCLOSED = 'unclosed'
COMPLETED = 'completed'
MISSED = 'missed'

FINISHED = frozenset({UNCLOSED, COMPLETED, MISSED})


def attendance_state(assignment, now: datetime) -> str | None:
    if assignment.status in (AssignmentStatus.CANCELLED, AssignmentStatus.RELEASED):
        return None
    checked_in = assignment.checked_in_at is not None
    checked_out = assignment.checked_out_at is not None
    if assignment.status == AssignmentStatus.COMPLETED or (checked_in and checked_out):
        return COMPLETED
    request = assignment.staffing_request
    if request is None:
        return None
    start = shift_start_utc(request.work_date, request.start_time)
    end = shift_end_utc(request.work_date, request.start_time, request.end_time)
    if checked_in:
        cutoff = end + timedelta(minutes=settings.checkout_cutoff_minutes)
        return ON_SHIFT if now < cutoff else UNCLOSED
    if now < start:
        return UPCOMING
    if now < end:
        return DUE
    return MISSED
