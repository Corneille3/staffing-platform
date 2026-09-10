// Request lifecycle buckets shared by the coordinator surface. Pure module
// (no React / Next imports) so it stays unit-testable and importable from
// server components alike.

// Statuses during which a broadcast is in flight and responses can land any
// second — the detail page ticks fast, shows the Live badge, and the waiting
// state.
export const LIVE_STATUSES = new Set(["open", "notified", "responses_received"]);

// Terminal statuses — nothing left to dispatch. Match / assign / cancel /
// accept controls hide on these; the backend 409s them anyway (cancelled,
// already assigned, ended shift), but a dead CTA is finding #8.
export const CLOSED_STATUSES = new Set(["assigned", "cancelled", "completed", "expired"]);

export function isClosedStatus(status: string): boolean {
  return CLOSED_STATUSES.has(status);
}
