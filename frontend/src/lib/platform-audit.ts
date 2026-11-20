// Tier-0 audit trail (`GET /platform/audit-log`) — pure helpers for the
// « Audit trail » card on /platform/settings. Wording comes from
// `platform.audit.*`; this file only holds values and shapes.
import type { PlatformAuditRow } from "./types";

/** The part of an action before the dot — mirrors AUDIT_CATEGORIES in the API. */
export const AUDIT_CATEGORIES = ["tenant", "operator", "access", "settings", "lead", "housekeeping"] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export const AUDIT_PAGE_SIZE = 25;

/** "operator.role_changed" -> "operator_role_changed" (a message key cannot hold a dot). */
export function auditActionKey(action: string): string {
  return action.replace(/\./g, "_");
}

export function auditCategory(action: string): string {
  return action.split(".")[0];
}

export type AuditDetail =
  | { kind: "role_change"; from: string; to: string }
  | { kind: "role"; role: string }
  | { kind: "reason"; text: string }
  | { kind: "members"; count: number }
  | { kind: "settings"; pairs: [string, string][] };

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** The one extra fact worth a second line under an action, or null. */
export function auditDetail(row: Pick<PlatformAuditRow, "action" | "details">): AuditDetail | null {
  const d = row.details ?? {};
  if (row.action === "operator.role_changed") {
    const from = text(d.from);
    const to = text(d.to);
    return from && to ? { kind: "role_change", from, to } : null;
  }
  if (row.action === "operator.invited" || row.action === "operator.removed") {
    const role = text(d.role);
    return role ? { kind: "role", role } : null;
  }
  if (row.action === "access.requested") {
    const reason = text(d.reason);
    return reason ? { kind: "reason", text: reason } : null;
  }
  if (row.action === "tenant.removed") {
    // Rows written before 2026-11-19 do not exist; a count of 0 says nothing.
    return typeof d.member_count === "number" && d.member_count > 0
      ? { kind: "members", count: d.member_count }
      : null;
  }
  if (row.action === "settings.updated") {
    const pairs = Object.entries(d).map(([key, value]): [string, string] => [
      key,
      Array.isArray(value) ? value.join(", ") : String(value),
    ]);
    return pairs.length ? { kind: "settings", pairs } : null;
  }
  return null;
}
