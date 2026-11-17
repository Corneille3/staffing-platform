/**
 * The dashboard's urgent card gets its two durations already worded by the
 * backend, in a compact English form: "5m ago", "in 2h30", "3d ago", "now",
 * "just now". This rewrites them for display (pure).
 *
 * English keeps the compact form without the "ago" / "in" (the tile's label
 * already says which); French spaces the units: "5 min", "2 h 30", "3 j".
 * Anything unrecognised is returned as sent.
 */
export function compactDuration(
  raw: string,
  locale: string,
  words: { now: string; justNow: string },
): string {
  const value = raw.replace(/ ago$/, "").replace(/^in /, "").trim();
  if (value === "now") return words.now;
  if (value === "just now") return words.justNow;
  if (locale !== "fr") return value;

  const minutes = /^(\d+)m$/.exec(value);
  if (minutes) return `${minutes[1]} min`;
  const hours = /^(\d+)h(\d+)?$/.exec(value);
  if (hours) return hours[2] ? `${hours[1]} h ${hours[2].padStart(2, "0")}` : `${hours[1]} h`;
  const days = /^(\d+)d$/.exec(value);
  if (days) return `${days[1]} j`;
  return value;
}

/** The roster rows carry the role's English label, not its code. Maps it back
 * to the key under `admin.roles`; null when the label is not a known one. */
export function roleKeyFromLabel(label: string | null | undefined): string | null {
  const byLabel: Record<string, string> = {
    Educator: "educator",
    "Assistant educator": "assistant_educator",
    PSW: "psw",
    Nurse: "nurse",
    "Food handler": "food_handler",
    Staff: "other",
  };
  return (label && byLabel[label]) || null;
}
