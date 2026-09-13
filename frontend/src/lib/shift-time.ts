/**
 * Shift-window arithmetic for the worker surface.
 *
 * `work_date` / `start_time` / `end_time` are Québec wall-clock values exactly
 * as entered — the browser of a worker in Québec shares that clock, so local
 * Date construction is the right interpretation (mirrors
 * `backend/app/core/timeutil.py`).
 */

/** The zone shift wall-clock values live in. Mirrors
 * `settings.shift_timezone` on the backend (global for now, per-org zones
 * would move this into the org payload). Server components render on Vercel
 * in UTC, so every "today", clock or day-grouping computed there must go
 * through these helpers — `new Date().getHours()` / `toISOString().slice(0, 10)`
 * are tomorrow's values between 20:00 and midnight in Québec (finding #18). */
export const SHIFT_TIMEZONE = "America/Toronto";

type Instant = Date | string | number;

function partsIn(instant: Instant): Record<string, string> {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHIFT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(instant))) out[p.type] = p.value;
  return out;
}

/** "YYYY-MM-DD" of an instant in the shift timezone — the key to group or
 * compare against `work_date`. Defaults to now. */
export function shiftDateKey(instant: Instant = Date.now()): string {
  const p = partsIn(instant);
  return `${p.year}-${p.month}-${p.day}`;
}

const WEEKDAY_IDX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** Wall-clock parts of an instant in the shift timezone. `weekdayIdx` is
 * Mon=0..Sun=6, matching the dashboard's week strip. Defaults to now. */
export function shiftClock(instant: Instant = Date.now()): { hour: number; minute: number; weekdayIdx: number } {
  const p = partsIn(instant);
  return { hour: Number(p.hour), minute: Number(p.minute), weekdayIdx: WEEKDAY_IDX[p.weekday] ?? 0 };
}

/** "HH:MM" wall-clock of an instant in the shift timezone — for timestamps
 * that arrive as UTC ISO strings (`responded_at`, `created_at`,
 * `checked_in_at`). Never slice the ISO string for this: that prints UTC.
 * Returns "" for an unparsable value. */
export function shiftTime(instant: Instant): string {
  if (Number.isNaN(new Date(instant).getTime())) return "";
  const p = partsIn(instant);
  return `${p.hour}:${p.minute}`;
}

/** "YYYY-MM-DD HH:MM" of an instant in the shift timezone — for stamps that
 * need the date too (assigned / checked in / checked out / viewed). Never
 * slice the ISO string for this: that prints the UTC date and time. */
export function shiftDateTime(instant: Instant): string {
  if (Number.isNaN(new Date(instant).getTime())) return "";
  const p = partsIn(instant);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** Minutes after the scheduled end during which "Done" still stamps a
 * check-out. Mirrors `settings.checkout_cutoff_minutes`; the backend 409s
 * past it regardless, this only decides what the Horaire offers. */
export const CHECKOUT_CUTOFF_MINUTES = 60;

type ShiftWindow = { work_date: string; start_time: string; end_time: string };

function localDateTime(isoDate: string, hhmm: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

/** Epoch ms of the scheduled start (local wall clock, see header). */
export function shiftStartMs(shift: ShiftWindow): number {
  return localDateTime(shift.work_date, shift.start_time.slice(0, 5)).getTime();
}

/** Epoch ms of the scheduled end. `end_time <= start_time` means the shift
 * crosses midnight and ends the next day — the same convention the backend
 * and the duration display use. */
export function shiftEndMs(shift: ShiftWindow): number {
  const end = localDateTime(shift.work_date, shift.end_time.slice(0, 5));
  if (shift.end_time.slice(0, 5) <= shift.start_time.slice(0, 5)) {
    end.setDate(end.getDate() + 1);
  }
  return end.getTime();
}

export type AttendancePhase = "live" | "ended" | "closed";

/** live = check-in and check-out both open · ended = check-in closed, check-out
 * still open (within the cutoff) · closed = both closed. */
export function attendancePhase(shift: ShiftWindow, nowMs: number): AttendancePhase {
  const end = shiftEndMs(shift);
  if (nowMs < end) return "live";
  if (nowMs < end + CHECKOUT_CUTOFF_MINUTES * 60_000) return "ended";
  return "closed";
}
