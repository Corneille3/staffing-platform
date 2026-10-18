import { MAX_SHIFT_MINUTES, formatDuration, shiftDuration } from "../lib/shift-duration";

/** One line under the Start/End inputs: the computed length, "ends the next
 * day" for an overnight window, rose when past the 16 h ceiling. */
export function ShiftDurationNote({ start, end }: { start: string; end: string }) {
  const d = shiftDuration(start, end);
  if (!d) return null;
  if (d.tooLong) {
    return (
      <p style={{ margin: "-6px 0 0", fontSize: 12.5, color: "var(--rose)" }}>
        {formatDuration(d.minutes)}{d.nextDay ? ", ending the next day" : ""} — a shift cannot last more than{" "}
        {MAX_SHIFT_MINUTES / 60} hours. Check the start and end times.
      </p>
    );
  }
  return (
    <p style={{ margin: "-6px 0 0", fontSize: 12.5, color: "var(--ink-3)" }}>
      Duration {formatDuration(d.minutes)}{d.nextDay ? " · ends the next day" : ""}
    </p>
  );
}
