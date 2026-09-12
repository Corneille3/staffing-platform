"use client";

import { useRouter } from "next/navigation";
import { startTransition, useCallback } from "react";
import { usePolling } from "../hooks/use-polling";

/**
 * Invisible. Re-runs the enclosing server page's fetches on an idle cadence
 * via router.refresh() — a soft refresh that keeps client state and scroll,
 * shows no skeleton, and pauses while the tab is hidden (the hook's rule).
 * For overview pages where a dedicated client fetcher isn't worth its weight.
 *
 * `active` + `activeMs` let a server page tighten the cadence while it has
 * something live to watch (the dashboard's open requests); the flag is read
 * through the hook's `isActive` ref, so a flip after a refresh just changes
 * the next period — no timer restart, no extra fetch.
 */
export function PollingRefresh({
  everyMs,
  activeMs,
  active = false,
}: {
  everyMs: number;
  activeMs?: number;
  active?: boolean;
}) {
  const router = useRouter();
  const refresh = useCallback(async () => {
    startTransition(() => router.refresh());
  }, [router]);
  usePolling(refresh, { activeMs: activeMs ?? everyMs, idleMs: everyMs, isActive: () => active });
  return null;
}
