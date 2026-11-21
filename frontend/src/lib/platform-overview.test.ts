import { describe, expect, it } from "vitest";
import { attentionCount, attentionHref, isKnownAttention } from "./platform-overview";

const item = (kind: string, extra: { tenant_id?: string | null; lead_id?: string | null } = {}) => ({
  kind,
  tenant_id: extra.tenant_id ?? null,
  lead_id: extra.lead_id ?? null,
});

describe("attentionHref", () => {
  it("sends lead counts to the filtered list", () => {
    expect(attentionHref(item("new_website_requests"))).toBe("/platform/leads?status=new&source=website_form");
    expect(attentionHref(item("overdue_followups"))).toBe("/platform/leads");
  });

  it("sends an overdue pilot to its lead", () => {
    expect(attentionHref(item("pilot_overdue", { lead_id: "L1" }))).toBe("/platform/leads/L1");
    expect(attentionHref(item("pilot_overdue"))).toBe("/platform/leads?status=pilot");
  });

  it("sends a tenant line to that tenant's row, even when it also has a lead", () => {
    for (const kind of ["invite_stale", "onboarding_stuck", "tenant_suspended", "access_request_pending"]) {
      expect(attentionHref(item(kind, { tenant_id: "T1", lead_id: "L1" }))).toBe("/platform/tenants?tenant=T1");
      expect(attentionHref(item(kind))).toBe("/platform/tenants");
    }
  });
});

describe("attentionCount", () => {
  it("counts what asks for an action, not the information lines nor unknown kinds", () => {
    expect(
      attentionCount([
        { kind: "invite_stale", info_only: false },
        { kind: "pilot_overdue", info_only: false },
        { kind: "access_request_pending", info_only: true },
        { kind: "something_new", info_only: false },
      ]),
    ).toBe(2);
    expect(attentionCount([])).toBe(0);
  });

  it("knows its kinds", () => {
    expect(isKnownAttention({ kind: "tenant_suspended" })).toBe(true);
    expect(isKnownAttention({ kind: "something_new" })).toBe(false);
  });
});
