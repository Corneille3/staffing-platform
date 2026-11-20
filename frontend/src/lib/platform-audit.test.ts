import { describe, expect, it } from "vitest";
import { auditActionKey, auditCategory, auditDetail } from "./platform-audit";

describe("auditActionKey / auditCategory", () => {
  it("turns the action into a message key and a category", () => {
    expect(auditActionKey("operator.role_changed")).toBe("operator_role_changed");
    expect(auditCategory("housekeeping.clerk_orphan_removed")).toBe("housekeeping");
  });
});

describe("auditDetail", () => {
  it("shows a role change as from -> to", () => {
    expect(
      auditDetail({ action: "operator.role_changed", details: { email: "a@b.c", from: "support", to: "operator" } }),
    ).toEqual({ kind: "role_change", from: "support", to: "operator" });
  });

  it("shows the role of an invited or removed operator", () => {
    expect(auditDetail({ action: "operator.invited", details: { email: "a@b.c", role: "marketing" } })).toEqual({
      kind: "role",
      role: "marketing",
    });
    expect(auditDetail({ action: "operator.removed", details: { email: "a@b.c" } })).toBeNull();
  });

  it("shows the reason of an access request", () => {
    expect(auditDetail({ action: "access.requested", details: { tenant_id: "x", reason: "Billing question" } })).toEqual({
      kind: "reason",
      text: "Billing question",
    });
    expect(auditDetail({ action: "access.requested", details: { tenant_id: "x", reason: "  " } })).toBeNull();
  });

  it("lists the settings that changed, arrays joined", () => {
    expect(
      auditDetail({ action: "settings.updated", details: { trial_length_days: 45, reserved_slugs: ["os", "app"] } }),
    ).toEqual({
      kind: "settings",
      pairs: [
        ["trial_length_days", "45"],
        ["reserved_slugs", "os, app"],
      ],
    });
  });

  it("shows how many accounts a removed tenant took with it", () => {
    expect(auditDetail({ action: "tenant.removed", details: { slug: "x", member_count: 4 } })).toEqual({
      kind: "members",
      count: 4,
    });
    expect(auditDetail({ action: "tenant.removed", details: { slug: "x", member_count: 0 } })).toBeNull();
  });

  it("has nothing to add for the other actions", () => {
    expect(auditDetail({ action: "tenant.suspended", details: { slug: "apf" } })).toBeNull();
    expect(auditDetail({ action: "lead.deleted", details: { org_name: "X" } })).toBeNull();
  });
});
