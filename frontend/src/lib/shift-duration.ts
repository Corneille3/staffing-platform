/** Shift length under the midnight-crossing convention (backend
 * `timeutil.shift_duration`): an end at or before the start ends the next
 * day. Pure — usable from server and client components. */

/** Mirrors backend `MAX_SHIFT_DURATION`: anything longer is a typo, e.g.
 * 15:30 → 12:00 reads as 20h30 (2026-10-18 prod finding). */
export const MAX_SHIFT_MINUTES = 16 * 60;

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export interface ShiftDuration {
  minutes: number;
  nextDay: boolean;
  tooLong: boolean;
}

export function shiftDuration(start: string, end: string): ShiftDuration | null {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === null || e === null) return null;
  const nextDay = e <= s;
  const minutes = nextDay ? e + 24 * 60 - s : e - s;
  return { minutes, nextDay, tooLong: minutes > MAX_SHIFT_MINUTES };
}

/** "8 h", "20 h 30". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}
