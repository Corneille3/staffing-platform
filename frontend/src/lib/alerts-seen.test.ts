import { describe, expect, it } from "vitest";
import {
  ALERTS_SEEN_KEY,
  badgeLabel,
  countNewAlerts,
  readAlertsSeenAt,
  writeAlertsSeenAt,
} from "./alerts-seen";

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    map,
  };
}

const items = [
  { created_at: "2026-09-13T10:00:00Z" },
  { created_at: "2026-09-13T12:00:00Z" },
  { created_at: "2026-09-13T14:00:00Z" },
];

describe("countNewAlerts", () => {
  it("counts everything when the device has never visited the Alertes page", () => {
    expect(countNewAlerts(items, null)).toBe(3);
  });
  it("counts only items strictly after the marker", () => {
    expect(countNewAlerts(items, "2026-09-13T11:00:00Z")).toBe(2);
    expect(countNewAlerts(items, "2026-09-13T12:00:00Z")).toBe(1);
    expect(countNewAlerts(items, "2026-09-13T15:00:00Z")).toBe(0);
  });
  it("is zero on an empty feed", () => {
    expect(countNewAlerts([], null)).toBe(0);
  });
});

describe("badgeLabel", () => {
  it("hides at zero, shows the count, caps at 9+", () => {
    expect(badgeLabel(0)).toBeNull();
    expect(badgeLabel(3)).toBe("3");
    expect(badgeLabel(9)).toBe("9");
    expect(badgeLabel(12)).toBe("9+");
  });
});

describe("marker storage", () => {
  it("round-trips through storage", () => {
    const storage = fakeStorage();
    expect(readAlertsSeenAt(storage)).toBeNull();
    writeAlertsSeenAt(storage, "2026-09-13T12:00:00.000Z");
    expect(storage.map.get(ALERTS_SEEN_KEY)).toBe("2026-09-13T12:00:00.000Z");
    expect(readAlertsSeenAt(storage)).toBe("2026-09-13T12:00:00.000Z");
  });
  it("ignores a corrupt marker and a missing storage", () => {
    expect(readAlertsSeenAt(fakeStorage({ [ALERTS_SEEN_KEY]: "not a date" }))).toBeNull();
    expect(readAlertsSeenAt(null)).toBeNull();
    expect(() => writeAlertsSeenAt(null, "2026-09-13T12:00:00Z")).not.toThrow();
  });
  it("swallows a storage that throws", () => {
    const throwing = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    expect(readAlertsSeenAt(throwing)).toBeNull();
    expect(() => writeAlertsSeenAt(throwing, "2026-09-13T12:00:00Z")).not.toThrow();
  });
});
