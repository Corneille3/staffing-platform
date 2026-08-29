"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PollingOptions<T> = {
  /** Tick interval while `isActive()` is true. */
  activeMs: number;
  /** Tick interval otherwise. */
  idleMs: number;
  /** Defaults to always idle. Re-evaluated after every tick. */
  isActive?: () => boolean;
  /** Seed so the first render has data (e.g. server-rendered props). */
  initialData?: T;
  /** Set false to stop polling entirely (still cleans up). */
  enabled?: boolean;
};

export type PollingState<T> = {
  data: T | undefined;
  /** Wall-clock ms of the last *successful* fetch, null until one lands. */
  lastSuccessAt: number | null;
  /** Consecutive failures since the last success. */
  failures: number;
  /** Fetch now and restart the timer from this moment. */
  refresh: () => void;
};

/**
 * Live-ish data without realtime: fetch on mount, then on a timer whose
 * period depends on `isActive()`. Pauses while the tab is hidden and fires
 * once immediately when it becomes visible again. Transient errors keep the
 * last good data and keep polling. A tick is skipped when the previous
 * fetch is still in flight, so requests never overlap.
 */
export function usePolling<T>(fetcher: () => Promise<T>, options: PollingOptions<T>): PollingState<T> {
  const { activeMs, idleMs, isActive, initialData, enabled = true } = options;
  const [data, setData] = useState<T | undefined>(initialData);
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);
  const [failures, setFailures] = useState(0);

  // Latest callbacks live in refs so the timer effect doesn't restart on
  // every render (callers pass inline closures).
  const fetcherRef = useRef(fetcher);
  const isActiveRef = useRef(isActive);
  fetcherRef.current = fetcher;
  isActiveRef.current = isActive;

  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const schedule = useCallback(() => {
    clearTimer();
    if (!mounted.current) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    const period = isActiveRef.current?.() ? activeMs : idleMs;
    timer.current = setTimeout(() => void tick(), period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMs, idleMs]);

  const tick = useCallback(async () => {
    if (!mounted.current) return;
    if (inFlight.current) {
      schedule();
      return;
    }
    inFlight.current = true;
    try {
      const next = await fetcherRef.current();
      if (!mounted.current) return;
      setData(next);
      setLastSuccessAt(Date.now());
      setFailures(0);
    } catch {
      if (!mounted.current) return;
      setFailures((n) => n + 1);
    } finally {
      inFlight.current = false;
      schedule();
    }
  }, [schedule]);

  useEffect(() => {
    if (!enabled) return;
    mounted.current = true;
    void tick();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void tick();
      } else {
        clearTimer();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mounted.current = false;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, tick]);

  const refresh = useCallback(() => {
    clearTimer();
    void tick();
  }, [tick]);

  return { data, lastSuccessAt, failures, refresh };
}
