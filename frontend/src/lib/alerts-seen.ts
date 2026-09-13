/** "New since my last visit" badge for the worker Alertes tab (worker-screens
 * plan, étape 6). The notification feed has no read state server-side, so
 * the marker is per device: the ISO instant of the last visit to the Alertes
 * page, kept in localStorage. Pure helpers — the caller passes the storage. */

export const ALERTS_SEEN_KEY = "staffig.worker.alertsSeenAt";

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/** `window.localStorage`, or null where touching it throws (privacy modes). */
export function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readAlertsSeenAt(storage: StorageLike | null | undefined): string | null {
  try {
    const value = storage?.getItem(ALERTS_SEEN_KEY) ?? null;
    return value && !Number.isNaN(Date.parse(value)) ? value : null;
  } catch {
    return null;
  }
}

export function writeAlertsSeenAt(storage: StorageLike | null | undefined, iso: string): void {
  try {
    storage?.setItem(ALERTS_SEEN_KEY, iso);
  } catch {
    // storage full or blocked — the badge just stays until the next visit
  }
}

/** Items created strictly after the marker. No marker yet = never visited on
 * this device = everything is new. */
export function countNewAlerts(items: { created_at: string }[], seenAtIso: string | null): number {
  if (!seenAtIso) return items.length;
  const seen = Date.parse(seenAtIso);
  return items.filter((item) => Date.parse(item.created_at) > seen).length;
}

/** Pill text: nothing at 0, "9+" past nine so the pill keeps one size. */
export function badgeLabel(count: number): string | null {
  if (count <= 0) return null;
  return count > 9 ? "9+" : String(count);
}
