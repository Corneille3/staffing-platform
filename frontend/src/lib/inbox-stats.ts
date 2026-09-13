import { shiftEndMs, shiftStartMs } from "./shift-time";

/**
 * The Boîte's "at a glance" numbers (worker-screens plan, étape 2), computed
 * client-side from the assignments + requests the inbox already loads — no
 * endpoint, no extra request. Pure so it can be unit-tested; the page feeds
 * it today's ISO date and the clock.
 *
 * - Hours this week: ISO week (Mon–Sun) containing today. Per shift,
 *   `worked_hours` once recorded; otherwise the scheduled duration for a
 *   shift still to come or under way. A missed shift, or one never checked
 *   out, counts 0 — the coordinator may credit hours later, and then
 *   `worked_hours` carries them. Cancelled / released never count.
 * - Completed: every assignment whose derived attendance says completed
 *   (checked out, or status COMPLETED), all time.
 * - Next shift: the soonest live (confirmed / pending) shift whose scheduled
 *   end hasn't passed — same "live" notion as the Horaire.
 */
export type StatsItem = {
  assignment: {
    status: string;
    worked_hours: number | null;
    attendance?: string | null;
  };
  request: { work_date: string; start_time: string; end_time: string } | null;
};

const LIVE = new Set(["pending_confirmation", "confirmed"]);
const NO_HOURS = new Set(["missed", "unclosed"]);

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Monday..Sunday of the ISO week containing `todayIso`, as ISO date strings
 * (so `work_date` string compare is date compare). */
export function isoWeekBounds(todayIso: string): { start: string; end: string } {
  const [y, m, d] = todayIso.split("-").map(Number);
  const weekdayFromMonday = (new Date(y, m - 1, d).getDay() + 6) % 7;
  return {
    start: toIso(new Date(y, m - 1, d - weekdayFromMonday)),
    end: toIso(new Date(y, m - 1, d - weekdayFromMonday + 6)),
  };
}

/** Scheduled length in hours; a shift crossing midnight (end <= start) ends
 * the next day, same convention as the backend. */
export function scheduledHours(shift: NonNullable<StatsItem["request"]>): number {
  return (shiftEndMs(shift) - shiftStartMs(shift)) / 3_600_000;
}

function counts(i: StatsItem): boolean {
  return i.request !== null && (LIVE.has(i.assignment.status) || i.assignment.status === "completed");
}

function isCompleted(i: StatsItem): boolean {
  return i.assignment.attendance === "completed" || i.assignment.status === "completed";
}

export function weekHours(items: StatsItem[], todayIso: string, nowMs: number): number {
  const { start, end } = isoWeekBounds(todayIso);
  let total = 0;
  for (const i of items) {
    if (!counts(i) || !i.request) continue;
    if (i.request.work_date < start || i.request.work_date > end) continue;
    const { worked_hours, attendance } = i.assignment;
    if (worked_hours != null) {
      total += worked_hours;
    } else if (attendance ? NO_HOURS.has(attendance) || attendance === "completed" : shiftEndMs(i.request) <= nowMs) {
      // Over without recorded hours: nothing to add (missed / unclosed, or a
      // completed row whose hours were never derived). Without a derived
      // state (tests, older payloads) "over" means the scheduled end passed.
      continue;
    } else {
      total += scheduledHours(i.request);
    }
  }
  return total;
}

export function completedCount(items: StatsItem[]): number {
  return items.filter(isCompleted).length;
}

export function nextShift<T extends StatsItem>(items: T[], nowMs: number): T | null {
  const live = items
    .filter((i): i is T & { request: NonNullable<StatsItem["request"]> } =>
      i.request !== null && LIVE.has(i.assignment.status) && shiftEndMs(i.request) > nowMs,
    )
    .sort((a, b) =>
      `${a.request.work_date}T${a.request.start_time}`.localeCompare(`${b.request.work_date}T${b.request.start_time}`),
    );
  return live[0] ?? null;
}
