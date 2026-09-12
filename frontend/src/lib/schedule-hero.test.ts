import { describe, expect, it } from "vitest";
import { splitSchedule } from "./schedule-hero";

const TODAY = "2026-09-12";
const at = (h: number, m: number) => new Date(2026, 8, 12, h, m).getTime();

function shift(
  id: string,
  work_date: string,
  start_time: string,
  end_time: string,
  status = "confirmed",
  stamps: { checked_in_at?: string | null; checked_out_at?: string | null } = {},
) {
  return { id, assignment: { status, ...stamps }, request: { work_date, start_time, end_time } };
}
const ids = (list: { id: string }[]) => list.map((i) => i.id);

describe("splitSchedule", () => {
  it("a missed shift gives the hero to a later same-day shift once its end has passed", () => {
    const missed = shift("missed", TODAY, "19:35", "20:05");
    const later = shift("later", TODAY, "21:00", "21:30");
    const { upcoming, past } = splitSchedule([missed, later], TODAY, at(20, 10));
    expect(ids(upcoming)).toEqual(["later"]);
    expect(ids(past)).toEqual(["missed"]);
  });

  it("while the first shift is still live it stays the hero and the later one queues behind", () => {
    const first = shift("first", TODAY, "19:35", "20:05");
    const later = shift("later", TODAY, "21:00", "21:30");
    expect(ids(splitSchedule([later, first], TODAY, at(19, 50)).upcoming)).toEqual(["first", "later"]);
  });

  it("a missed shift keeps the hero until midnight when nothing else is left today", () => {
    const missed = shift("missed", TODAY, "19:35", "20:05");
    const tomorrow = shift("tomorrow", "2026-09-13", "08:00", "12:00");
    const { upcoming, past } = splitSchedule([tomorrow, missed], TODAY, at(23, 30));
    expect(ids(upcoming)).toEqual(["missed", "tomorrow"]);
    expect(past).toEqual([]);
  });

  it("a checked-out shift yields to a later same-day shift, otherwise stays as today's hero", () => {
    const done = shift("done", TODAY, "08:00", "12:00", "completed", {
      checked_in_at: "2026-09-12T12:00:00Z",
      checked_out_at: "2026-09-12T16:00:00Z",
    });
    const later = shift("later", TODAY, "14:00", "18:00");
    expect(ids(splitSchedule([done, later], TODAY, at(12, 30)).upcoming)).toEqual(["later"]);
    expect(ids(splitSchedule([done], TODAY, at(12, 30)).upcoming)).toEqual(["done"]);
  });

  it("checked in but not out keeps the hero until the check-out cutoff, then finishes", () => {
    const onShift = shift("onShift", TODAY, "08:00", "12:00", "confirmed", { checked_in_at: "2026-09-12T12:00:00Z" });
    const later = shift("later", TODAY, "15:00", "18:00");
    expect(ids(splitSchedule([onShift, later], TODAY, at(12, 30)).upcoming)).toEqual(["onShift", "later"]);
    expect(ids(splitSchedule([onShift, later], TODAY, at(13, 1)).upcoming)).toEqual(["later"]);
  });

  it("orders same-day shifts by start time, and history most recent first", () => {
    const late = shift("late", TODAY, "15:00", "18:00");
    const early = shift("early", TODAY, "08:00", "12:00");
    const oldLive = shift("oldLive", "2026-09-10", "08:00", "12:00");
    const cancelled = shift("cancelled", "2026-09-11", "08:00", "12:00", "cancelled");
    const { upcoming, past } = splitSchedule([late, oldLive, early, cancelled], TODAY, at(7, 0));
    expect(ids(upcoming)).toEqual(["early", "late"]);
    expect(ids(past)).toEqual(["cancelled", "oldLive"]);
  });

  it("an assignment without a request goes to history when live, never to the hero", () => {
    const orphan = { id: "orphan", assignment: { status: "confirmed" }, request: null };
    const { upcoming, past } = splitSchedule([orphan], TODAY, at(9, 0));
    expect(upcoming).toEqual([]);
    expect(ids(past)).toEqual(["orphan"]);
  });
});
