"use client";

import { useRouter } from "next/navigation";
import { startTransition, useCallback } from "react";
import { usePolling } from "../hooks/use-polling";

/**
 * Invisible. Re-runs the enclosing server page's fetches on an idle cadence
 * via router.refresh() — a soft refresh that keeps client state and scroll,
 * shows no skeleton, and pauses while the tab is hidden (the hook's rule).
 * For overview pages where a dedicated client fetcher isn't worth its weight.
 */
export function PollingRefresh({ everyMs }: { everyMs: number }) {
  const router = useRouter();
  const refresh = useCallback(async () => {
    startTransition(() => router.refresh());
  }, [router]);
  usePolling(refresh, { activeMs: everyMs, idleMs: everyMs });
  return null;
}
