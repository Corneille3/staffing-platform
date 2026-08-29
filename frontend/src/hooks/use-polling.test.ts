import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePolling } from "./use-polling";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("usePolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches on mount, at activeMs while active, then idleMs once terminal", async () => {
    let status = "open";
    const fetcher = vi.fn(async () => status);
    const { result } = renderHook(() =>
      usePolling(fetcher, { activeMs: 5_000, idleMs: 30_000, isActive: () => status === "open" }),
    );
    await act(async () => {});
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.data).toBe("open");

    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(fetcher).toHaveBeenCalledTimes(2);

    status = "assigned";
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(result.current.data).toBe("assigned");

    // Now idle: nothing at +5s, one more at +30s.
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(fetcher).toHaveBeenCalledTimes(3);
    await act(async () => { await vi.advanceTimersByTimeAsync(25_000); });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("pauses while hidden and fetches immediately on becoming visible", async () => {
    const fetcher = vi.fn(async () => 1);
    renderHook(() => usePolling(fetcher, { activeMs: 5_000, idleMs: 5_000 }));
    await act(async () => {});
    expect(fetcher).toHaveBeenCalledTimes(1);

    act(() => setVisibility("hidden"));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => { setVisibility("visible"); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("never overlaps requests: a due tick is skipped while a fetch is in flight", async () => {
    let resolveFirst: (v: number) => void = () => {};
    const fetcher = vi
      .fn<() => Promise<number>>()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementation(async () => 2);
    const { result } = renderHook(() => usePolling(fetcher, { activeMs: 1_000, idleMs: 1_000 }));
    await act(async () => {});
    expect(fetcher).toHaveBeenCalledTimes(1);

    // The first fetch is still pending — several periods elapse, no new call.
    await act(async () => { await vi.advanceTimersByTimeAsync(3_500); });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => { resolveFirst(1); });
    expect(result.current.data).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps the last good data through transient failures and keeps polling", async () => {
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("good")
      .mockRejectedValueOnce(new Error("boom"))
      .mockRejectedValueOnce(new Error("boom"))
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue("recovered");
    const { result } = renderHook(() => usePolling(fetcher, { activeMs: 1_000, idleMs: 1_000 }));
    await act(async () => {});
    expect(result.current.data).toBe("good");
    const firstSuccess = result.current.lastSuccessAt;

    for (let i = 0; i < 3; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    }
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(result.current.data).toBe("good");
    expect(result.current.failures).toBe(3);
    expect(result.current.lastSuccessAt).toBe(firstSuccess);

    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(result.current.data).toBe("recovered");
    expect(result.current.failures).toBe(0);
  });

  it("clears the timer on unmount", async () => {
    const fetcher = vi.fn(async () => 1);
    const { unmount } = renderHook(() => usePolling(fetcher, { activeMs: 1_000, idleMs: 1_000 }));
    await act(async () => {});
    expect(fetcher).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refresh() fetches now and restarts the timer", async () => {
    const fetcher = vi.fn(async () => 1);
    const { result } = renderHook(() => usePolling(fetcher, { activeMs: 5_000, idleMs: 5_000 }));
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    await act(async () => { result.current.refresh(); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
