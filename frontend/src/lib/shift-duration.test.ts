import { describe, expect, it } from "vitest";

import { formatDuration, shiftDuration } from "./shift-duration";

describe("shiftDuration", () => {
  it("reads a same-day shift", () => {
    expect(shiftDuration("08:00", "16:00")).toEqual({ minutes: 480, nextDay: false, tooLong: false });
  });

  it("reads an overnight shift as ending the next day", () => {
    expect(shiftDuration("22:00", "06:00")).toEqual({ minutes: 480, nextDay: true, tooLong: false });
  });

  it("flags 15:30 → 12:00 as too long", () => {
    expect(shiftDuration("15:30", "12:00")).toEqual({ minutes: 1230, nextDay: true, tooLong: true });
  });

  it("treats equal times as 24 h, too long", () => {
    expect(shiftDuration("09:00", "09:00")?.tooLong).toBe(true);
  });

  it("allows exactly 16 h and accepts HH:MM:SS", () => {
    expect(shiftDuration("06:00:00", "22:00:00")?.tooLong).toBe(false);
  });

  it("returns null on an empty field", () => {
    expect(shiftDuration("", "12:00")).toBeNull();
  });
});

describe("formatDuration", () => {
  it("formats whole and partial hours", () => {
    expect(formatDuration(480)).toBe("8 h");
    expect(formatDuration(1230)).toBe("20 h 30");
  });
});
