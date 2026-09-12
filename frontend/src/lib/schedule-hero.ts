import { attendancePhase } from "./shift-time";

/**
 * Which shift the worker's Horaire puts in the hero, and which ones go to
 * History. Pure so it can be unit-tested; the page feeds it `items`, today's
 * ISO date and a ticking `nowMs`.
 *
 * Rules (2026-09-12, after the "Arrivée non enregistrée" question):
 * - Upcoming = confirmed/pending shifts dated today or later, soonest first
 *   (date, then start time). The hero is the first one.
 * - A shift *finished today* — checked out, or missed (never checked in and
 *   the scheduled end has passed), or checked in but the check-out window is
 *   closed — keeps the hero only while nothing else is left today, so the
 *   worker still sees their hours / the missed notice until midnight. The
 *   moment a later same-day shift exists, that one takes the hero and the
 *   finished shift drops to History with its notice.
 * - Shifts dated before today, cancelled ones, and completed ones not kept
 *   as today's hero are History, most recent first.
 */
export type ScheduleItem = {
  assignment: {
    status: string;
    checked_in_at?: string | null;
    checked_out_at?: string | null;
  };
  request: { work_date: string; start_time: string; end_time: string } | null;
};

export type ScheduleSplit<T> = { upcoming: T[]; past: T[] };

const LIVE = new Set(["pending_confirmation", "confirmed"]);

function sortKey(i: ScheduleItem): string {
  return `${i.request?.work_date ?? ""}T${i.request?.start_time ?? ""}`;
}

function isLive(i: ScheduleItem): boolean {
  return LIVE.has(i.assignment.status);
}

/** Done for today, nothing left to tap: checked out, missed, or check-out window over. */
function finishedToday(i: ScheduleItem, todayIso: string, nowMs: number): boolean {
  if (!i.request || i.request.work_date !== todayIso) return false;
  if (i.assignment.status === "completed") return true;
  if (!isLive(i)) return false;
  const phase = attendancePhase(i.request, nowMs);
  const checkedIn = !!i.assignment.checked_in_at;
  const checkedOut = !!i.assignment.checked_out_at;
  if (!checkedIn) return phase !== "live"; // missed: check-in closed at the scheduled end
  if (!checkedOut) return phase === "closed"; // on shift: Done stays available until the cutoff
  return true;
}

export function splitSchedule<T extends ScheduleItem>(
  items: T[],
  todayIso: string,
  nowMs: number,
): ScheduleSplit<T> {
  const sorted = [...items].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const isPastDate = (i: T) => (i.request?.work_date ?? "") < todayIso;

  const finished = sorted.filter((i) => finishedToday(i, todayIso, nowMs));
  const stillMatters = sorted.filter((i) => isLive(i) && !isPastDate(i) && !finished.includes(i));
  const laterToday = stillMatters.some((i) => i.request?.work_date === todayIso);

  // Nothing else today → the most recent finished shift stays in the hero.
  const kept = !laterToday && finished.length > 0 ? [finished[finished.length - 1]] : [];
  const upcoming = [...kept, ...stillMatters];

  const past = sorted
    .filter((i) => !upcoming.includes(i))
    .filter(
      (i) =>
        i.assignment.status === "completed" ||
        i.assignment.status === "cancelled" ||
        (isLive(i) && (isPastDate(i) || finished.includes(i))),
    )
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)));

  return { upcoming, past };
}
