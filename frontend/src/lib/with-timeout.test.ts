import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TIMED_OUT, withTimeout } from "./with-timeout";

describe("withTimeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves with the value when the promise settles first", async () => {
    const result = withTimeout(Promise.resolve("granted"), 1000);
    await expect(result).resolves.toBe("granted");
  });

  it("resolves with TIMED_OUT when the promise never settles", async () => {
    const result = withTimeout(new Promise<string>(() => {}), 20_000);
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(result).resolves.toBe(TIMED_OUT);
  });

  it("still rejects when the promise rejects first", async () => {
    const result = withTimeout(Promise.reject(new Error("boom")), 1000);
    await expect(result).rejects.toThrow("boom");
  });
});
