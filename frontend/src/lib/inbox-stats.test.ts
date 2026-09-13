import { describe, expect, it } from "vitest";
import { completedCount, isoWeekBounds, nextShift, scheduledHours, weekHours } from "./inbox-stats";

// 2026-09-13 is a Sunday; the ISO week runs Mon 09-07 → Sun 09-13.
const TODAY = "2026-09-13";
const NOW = new Date(2026, 8, 13, 12, 0).getTime();

const shift = (
  work_date: string,
  start_time: string,
  end_time: string,
  assignment: Partial<{ status: string; worked_hours: number | null; attendance: string | null }> = {},
) => ({
  assignment: { status: "confirmed", worked_hours: null, attendance: null, ...assignment },
  request: { work_date, start_time, end_time },
});

describe("isoWeekBounds", () => {
  it("runs Monday to Sunday around a Sunday", () => {
    expect(isoWeekBounds("2026-09-13")).toEqual({ start: "2026-09-07", end: "2026-09-13" });
  });
  it("starts on the day itself for a Monday", () => {
    expect(isoWeekBounds("2026-09-14")).toEqual({ start: "2026-09-14", end: "2026-09-20" });
  });
});

describe("scheduledHours", () => {
  it("is the plain span for a same-day shift", () => {
    expect(scheduledHours({ work_date: "2026-09-10", start_time: "08:00:00", end_time: "12:00:00" })).toBe(4);
  });
  it("crosses midnight when end <= start", () => {
    expect(scheduledHours({ work_date: "2026-09-10", start_time: "22:00:00", end_time: "06:00:00" })).toBe(8);
  });
});

describe("weekHours", () => {
  it("adds recorded hours, then the scheduled span of shifts still to come", () => {
    const items = [
      shift("2026-09-08", "08:00:00", "16:00:00", { attendance: "completed", worked_hours: 7.5 }),
      shift("2026-09-13", "14:00:00", "18:00:00", { attendance: "upcoming" }),
    ];
    expect(weekHours(items, TODAY, NOW)).toBe(11.5);
  });
  it("counts 0 for a missed or never-closed shift, and ignores cancelled / released", () => {
    const items = [
      shift("2026-09-09", "08:00:00", "16:00:00", { attendance: "missed" }),
      shift("2026-09-10", "08:00:00", "16:00:00", { attendance: "unclosed" }),
      shift("2026-09-11", "08:00:00", "16:00:00", { status: "cancelled", attendance: null }),
      shift("2026-09-12", "08:00:00", "16:00:00", { status: "released", attendance: null }),
    ];
    expect(weekHours(items, TODAY, NOW)).toBe(0);
  });
  it("leaves other weeks out", () => {
    const items = [
      shift("2026-09-06", "08:00:00", "16:00:00", { attendance: "completed", worked_hours: 8 }),
      shift("2026-09-14", "08:00:00", "12:00:00", { attendance: "upcoming" }),
    ];
    expect(weekHours(items, TODAY, NOW)).toBe(0);
  });
  it("falls back to the clock when no derived state is present", () => {
    const items = [
      shift("2026-09-13", "08:00:00", "10:00:00"), // over by noon, no stamps → 0
      shift("2026-09-13", "14:00:00", "18:00:00"), // still to come → 4
    ];
    expect(weekHours(items, TODAY, NOW)).toBe(4);
  });
});

describe("completedCount", () => {
  it("counts derived-completed and status-completed rows, all time", () => {
    const items = [
      shift("2026-06-01", "08:00:00", "16:00:00", { attendance: "completed", worked_hours: 8 }),
      shift("2026-09-08", "08:00:00", "16:00:00", { status: "completed", attendance: null }),
      shift("2026-09-09", "08:00:00", "16:00:00", { attendance: "missed" }),
      shift("2026-09-13", "14:00:00", "18:00:00", { attendance: "upcoming" }),
    ];
    expect(completedCount(items)).toBe(2);
  });
});

describe("nextShift", () => {
  it("picks the soonest live shift whose end hasn't passed", () => {
    const later = shift("2026-09-20", "08:00:00", "12:00:00");
    const soon = shift("2026-09-13", "14:00:00", "18:00:00", { status: "pending_confirmation" });
    const over = shift("2026-09-13", "08:00:00", "10:00:00");
    const cancelled = shift("2026-09-13", "13:00:00", "15:00:00", { status: "cancelled" });
    expect(nextShift([later, over, cancelled, soon], NOW)).toBe(soon);
  });
  it("is null when nothing is left", () => {
    expect(nextShift([shift("2026-09-13", "08:00:00", "10:00:00")], NOW)).toBeNull();
    expect(nextShift([], NOW)).toBeNull();
  });
});
