import { useTranslations } from "next-intl";
import { MAX_SHIFT_MINUTES, formatDuration, shiftDuration } from "../lib/shift-duration";

/** One line under the Start/End inputs: the computed length, "ends the next
 * day" for an overnight window, rose when past the 16 h ceiling. */
export function ShiftDurationNote({ start, end }: { start: string; end: string }) {
  const t = useTranslations("admin.form");
  const d = shiftDuration(start, end);
  if (!d) return null;
  if (d.tooLong) {
    return (
      <p style={{ margin: "-6px 0 0", fontSize: 12.5, color: "var(--rose)" }}>
        {t(d.nextDay ? "durationTooLongNextDay" : "durationTooLong", { duration: formatDuration(d.minutes), max: MAX_SHIFT_MINUTES / 60 })}
      </p>
    );
  }
  return (
    <p style={{ margin: "-6px 0 0", fontSize: 12.5, color: "var(--ink-3)" }}>
      {t(d.nextDay ? "durationNextDay" : "duration", { duration: formatDuration(d.minutes) })}
    </p>
  );
}
