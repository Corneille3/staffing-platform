import { describe, expect, it } from "vitest";
import { addDaysIso, dayOfMonth, isPastDay, mondayOfIso, weekRangeLabel } from "./availability-week";

describe("mondayOfIso", () => {
  it("keeps a Monday", () => {
    expect(mondayOfIso("2026-09-07")).toBe("2026-09-07");
  });
  it("maps a Sunday back to the Monday six days earlier", () => {
    expect(mondayOfIso("2026-09-13")).toBe("2026-09-07");
  });
  it("crosses a month boundary", () => {
    expect(mondayOfIso("2026-10-01")).toBe("2026-09-28");
  });
});

describe("addDaysIso", () => {
  it("adds across a month end", () => {
    expect(addDaysIso("2026-09-28", 6)).toBe("2026-10-04");
  });
  it("subtracts across a year start", () => {
    expect(addDaysIso("2026-01-02", -7)).toBe("2025-12-26");
  });
  it("reads the day of month", () => {
    expect(dayOfMonth("2026-09-07")).toBe(7);
  });
});

describe("isPastDay", () => {
  it("is true only strictly before today", () => {
    expect(isPastDay("2026-09-12", "2026-09-13")).toBe(true);
    expect(isPastDay("2026-09-13", "2026-09-13")).toBe(false);
    expect(isPastDay("2026-09-14", "2026-09-13")).toBe(false);
  });
});

describe("weekRangeLabel", () => {
  it("same month", () => {
    expect(weekRangeLabel("2026-09-07", "fr")).toBe("7 – 13 septembre");
    expect(weekRangeLabel("2026-09-07", "en")).toBe("September 7 – 13");
  });
  it("month boundary", () => {
    expect(weekRangeLabel("2026-09-28", "fr")).toBe("28 septembre – 4 octobre");
    expect(weekRangeLabel("2026-09-28", "en")).toBe("September 28 – October 4");
  });
  it("year boundary", () => {
    expect(weekRangeLabel("2025-12-29", "fr")).toBe("29 décembre 2025 – 4 janvier 2026");
    expect(weekRangeLabel("2025-12-29", "en")).toBe("December 29, 2025 – January 4, 2026");
  });
  it("uses 1er in French", () => {
    expect(weekRangeLabel("2026-06-01", "fr")).toBe("1er – 7 juin");
  });
});
