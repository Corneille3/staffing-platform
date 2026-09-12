import { describe, expect, it } from "vitest";
import { attendancePhase, CHECKOUT_CUTOFF_MINUTES, shiftClock, shiftDateKey, shiftDateTime, shiftEndMs, shiftTime } from "./shift-time";

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

describe("shiftDateKey", () => {
  it("is still yesterday's date late in the Québec evening (EDT)", () => {
    expect(shiftDateKey("2026-09-10T01:30:00Z")).toBe("2026-09-09");
  });
  it("handles standard time (EST) the same way", () => {
    expect(shiftDateKey("2026-01-10T04:30:00Z")).toBe("2026-01-09");
  });
  it("matches the UTC date during the day", () => {
    expect(shiftDateKey("2026-09-09T15:00:00Z")).toBe("2026-09-09");
  });
});

describe("shiftClock", () => {
  it("gives Québec wall-clock hour and Mon=0 weekday", () => {
    // 2026-09-09 is a Wednesday; 01:30Z on the 10th is 21:30 EDT on the 9th.
    expect(shiftClock("2026-09-10T01:30:00Z")).toEqual({ hour: 21, minute: 30, weekdayIdx: 2 });
  });
  it("reads midnight as hour 0, not 24", () => {
    expect(shiftClock("2026-09-10T04:00:00Z").hour).toBe(0);
  });
});

describe("shiftTime", () => {
  it("prints the Québec wall-clock, not the UTC slice (EDT)", () => {
    // The activity row bug: 01:09Z showed as "01:09" for a 21:09 event.
    expect(shiftTime("2026-09-10T01:09:35Z")).toBe("21:09");
  });
  it("handles standard time (EST)", () => {
    expect(shiftTime("2026-01-10T04:05:00Z")).toBe("23:05");
  });
  it("zero-pads and reads midnight as 00", () => {
    expect(shiftTime("2026-09-10T04:00:00Z")).toBe("00:00");
    expect(shiftTime("2026-09-09T10:04:00Z")).toBe("06:04");
  });
  it("accepts a Date or epoch ms and returns empty for junk", () => {
    expect(shiftTime(new Date("2026-09-10T01:09:35Z"))).toBe("21:09");
    expect(shiftTime(Date.parse("2026-09-10T01:09:35Z"))).toBe("21:09");
    expect(shiftTime("not-a-date")).toBe("");
  });
});

describe("shiftDateTime", () => {
  it("prints the Québec date and time, not the UTC slice", () => {
    // The assigned-card bug: 2026-09-10T00:58Z showed as "2026-09-10 00:58" for Sept 9, 20:58.
    expect(shiftDateTime("2026-09-10T00:58:12Z")).toBe("2026-09-09 20:58");
    expect(shiftDateTime("2026-01-10T04:05:00Z")).toBe("2026-01-09 23:05");
  });
  it("returns empty for junk", () => {
    expect(shiftDateTime("nope")).toBe("");
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
