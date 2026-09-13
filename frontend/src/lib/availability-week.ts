/** Pure helpers for the worker Disponibilités grid (worker-screens plan,
 * étape 4). Dates are "YYYY-MM-DD" strings compared lexically, so nothing
 * here depends on the browser timezone — the caller derives "today" from
 * `shiftDateKey()` (America/Toronto) and passes it in. */

export type GridLocale = "fr" | "en";

function parts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Add `n` days to an ISO date (UTC arithmetic, so no DST surprises). */
export function addDaysIso(iso: string, n: number): string {
  const { y, m, d } = parts(iso);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return toIso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Monday of the week containing `iso` (weeks run Monday → Sunday). */
export function mondayOfIso(iso: string): string {
  const { y, m, d } = parts(iso);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDaysIso(iso, dow === 0 ? -6 : 1 - dow);
}

/** Day-of-month as a number, for the day header. */
export function dayOfMonth(iso: string): number {
  return parts(iso).d;
}

/** A day strictly before today is past: its slots can't be matched any
 * more. Today's slots stay editable (a same-day shift may still come in). */
export function isPastDay(iso: string, todayIso: string): boolean {
  return iso < todayIso;
}

function monthName(y: number, m: number, locale: GridLocale): string {
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** "7 – 13 septembre" / "September 7 – 13". Spans a month boundary as
 * "28 septembre – 4 octobre" and a year boundary as
 * "29 décembre 2025 – 4 janvier 2026". */
export function weekRangeLabel(weekStartIso: string, locale: GridLocale): string {
  const a = parts(weekStartIso);
  const b = parts(addDaysIso(weekStartIso, 6));
  const sameYear = a.y === b.y;
  const sameMonth = sameYear && a.m === b.m;
  const ma = monthName(a.y, a.m, locale);
  const mb = monthName(b.y, b.m, locale);
  if (locale === "fr") {
    const da = a.d === 1 ? "1er" : String(a.d);
    if (sameMonth) return `${da} – ${b.d} ${ma}`;
    if (sameYear) return `${da} ${ma} – ${b.d} ${mb}`;
    return `${da} ${ma} ${a.y} – ${b.d} ${mb} ${b.y}`;
  }
  if (sameMonth) return `${ma} ${a.d} – ${b.d}`;
  if (sameYear) return `${ma} ${a.d} – ${mb} ${b.d}`;
  return `${ma} ${a.d}, ${a.y} – ${mb} ${b.d}, ${b.y}`;
}
