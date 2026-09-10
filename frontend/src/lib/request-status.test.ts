import { describe, expect, it } from "vitest";
import { CLOSED_STATUSES, isClosedStatus, LIVE_STATUSES } from "./request-status";

describe("isClosedStatus", () => {
  it("treats expired as terminal alongside assigned / cancelled / completed (finding #8)", () => {
    for (const status of ["assigned", "cancelled", "completed", "expired"]) {
      expect(isClosedStatus(status)).toBe(true);
    }
  });
  it("keeps every fillable status open", () => {
    for (const status of ["draft", "open", "notified", "responses_received"]) {
      expect(isClosedStatus(status)).toBe(false);
    }
  });
  it("never overlaps the live (fast-polling) set", () => {
    for (const status of LIVE_STATUSES) expect(CLOSED_STATUSES.has(status)).toBe(false);
  });
});
