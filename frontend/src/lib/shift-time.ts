/**
 * Shift-window arithmetic for the worker surface.
 *
 * `work_date` / `start_time` / `end_time` are Québec wall-clock values exactly
 * as entered — the browser of a worker in Québec shares that clock, so local
 * Date construction is the right interpretation (mirrors
 * `backend/app/core/timeutil.py`).
 */

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
