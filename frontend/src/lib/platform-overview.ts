// `/platform` overview — pure helpers for the « to watch » list. Wording
// comes from `platform.overview.*`; this file only holds values and shapes.
import type { LeadStatus, OverviewAttentionItem } from "./types";

/** Open stages first, in pipeline order, then the two closed ones. */
export const PIPELINE_OPEN: LeadStatus[] = ["new", "contacted", "demo_booked", "invited", "pilot"];
export const PIPELINE_CLOSED: LeadStatus[] = ["won", "lost"];

/** The kinds this screen knows how to word. An unknown kind (a newer API)
 * is skipped rather than shown as a raw code. */
export const ATTENTION_KINDS = [
  "new_website_requests",
  "overdue_followups",
  "pilot_overdue",
  "invite_stale",
  "onboarding_stuck",
  "tenant_suspended",
  "access_request_pending",
] as const;

export function isKnownAttention(item: Pick<OverviewAttentionItem, "kind">): boolean {
  return (ATTENTION_KINDS as readonly string[]).includes(item.kind);
}

/** Where a line leads: the lead, the tenant's row, or the filtered list.
 * Paths are locale-less (the i18n `Link` adds the prefix). */
export function attentionHref(
  item: Pick<OverviewAttentionItem, "kind" | "tenant_id" | "lead_id">,
): string {
  switch (item.kind) {
    case "new_website_requests":
      return "/platform/leads?status=new&source=website_form";
    case "overdue_followups":
      // The default sort of the list is « soonest action first »: the late
      // ones are on top.
      return "/platform/leads";
    case "pilot_overdue":
      return item.lead_id ? `/platform/leads/${item.lead_id}` : "/platform/leads?status=pilot";
    default:
      return item.tenant_id ? `/platform/tenants?tenant=${item.tenant_id}` : "/platform/tenants";
  }
}

/** What still asks for an action — the information lines do not count. */
export function attentionCount(items: Pick<OverviewAttentionItem, "kind" | "info_only">[]): number {
  return items.filter((item) => isKnownAttention(item) && !item.info_only).length;
}
