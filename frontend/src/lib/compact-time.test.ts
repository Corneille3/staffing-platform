import { describe, expect, it } from "vitest";
import { compactDuration, roleKeyFromLabel } from "./compact-time";

const words = { now: "maintenant", justNow: "à l'instant" };

describe("compactDuration", () => {
  it("drops 'ago' and 'in' and keeps the compact form in English", () => {
    expect(compactDuration("5m ago", "en", words)).toBe("5m");
    expect(compactDuration("in 2h30", "en", words)).toBe("2h30");
  });

  it("spaces the units in French", () => {
    expect(compactDuration("5m ago", "fr", words)).toBe("5 min");
    expect(compactDuration("in 2h", "fr", words)).toBe("2 h");
    expect(compactDuration("in 2h5", "fr", words)).toBe("2 h 05");
    expect(compactDuration("3d ago", "fr", words)).toBe("3 j");
  });

  it("words 'now' and 'just now'", () => {
    expect(compactDuration("now", "fr", words)).toBe("maintenant");
    expect(compactDuration("just now", "fr", words)).toBe("à l'instant");
  });

  it("returns an unknown value as sent", () => {
    expect(compactDuration("soon", "fr", words)).toBe("soon");
  });
});

describe("roleKeyFromLabel", () => {
  it("maps the backend's English label back to the role key", () => {
    expect(roleKeyFromLabel("Assistant educator")).toBe("assistant_educator");
    expect(roleKeyFromLabel("Staff")).toBe("other");
  });

  it("is null for an unknown or missing label", () => {
    expect(roleKeyFromLabel("Cook")).toBeNull();
    expect(roleKeyFromLabel(null)).toBeNull();
  });
});
