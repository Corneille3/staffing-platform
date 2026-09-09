import { describe, expect, it } from "vitest";
import { attendancePhase, CHECKOUT_CUTOFF_MINUTES, shiftEndMs } from "./shift-time";

const MIN = 60_000;
const day = { work_date: "2026-09-09", start_time: "09:30:00", end_time: "10:00:00" };
const overnight = { work_date: "2026-09-09", start_time: "22:00:00", end_time: "06:00:00" };

describe("shiftEndMs", () => {
  it("reads the end as local wall-clock on the work date", () => {
    expect(shiftEndMs(day)).toBe(new Date(2026, 8, 9, 10, 0).getTime());
  });
  it("rolls a midnight-crossing end to the next day", () => {
    expect(shiftEndMs(overnight)).toBe(new Date(2026, 8, 10, 6, 0).getTime());
  });
});

describe("attendancePhase", () => {
  const end = shiftEndMs(day);
  it("is live until the scheduled end", () => {
    expect(attendancePhase(day, end - 1)).toBe("live");
  });
  it("closes check-in at the end but keeps check-out open within the cutoff", () => {
    expect(attendancePhase(day, end)).toBe("ended");
    expect(attendancePhase(day, end + (CHECKOUT_CUTOFF_MINUTES - 1) * MIN)).toBe("ended");
  });
  it("closes everything once the cutoff has passed", () => {
    expect(attendancePhase(day, end + CHECKOUT_CUTOFF_MINUTES * MIN)).toBe("closed");
  });
});
