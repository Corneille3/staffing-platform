// Pure helpers for the operator-level sales pipeline (/platform/leads).
// Server pages and client components both import from here — keep it free of
// React and of "use client".

import type { Lead, LeadStatus } from "./types";

// Display order = pipeline order (SPEC_PLATFORM_LEADS §4 + §14): the pilot
// runs in the prospect's own workspace, so the invitation comes first.
export const LEAD_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "demo_booked",
  "invited",
  "pilot",
  "won",
  "lost",
];

// Mirrors backend schemas/platform_leads.py — adding a segment there means
// adding it here and in both message files.
export const LEAD_SEGMENTS = [
  "rpa_qc",
  "chsld_qc",
  "cpe_qc",
  "ltc_on",
  "retirement_on",
  "agency_on",
  "childcare_sk",
  "ltc_sk",
  "school_board",
  "other",
] as const;

export const LEAD_KINDS = ["prospect", "enterprise", "channel"] as const;

export const LEAD_SOURCES = [
  "research",
  "facebook_ad",
  "linkedin_dm",
  "website_form",
  "referral",
  "cold_outreach",
  "event",
  "other",
] as const;

export const LEAD_BAN_PHASES = ["P1", "P2", "P3", "none"] as const;
export const LEAD_WAVES = ["A", "B", "C"] as const;
export const LEAD_PROVINCES = ["QC", "ON", "SK"] as const;
export const LEAD_EVENT_TYPES = ["note", "call", "email", "meeting", "demo"] as const;
export const LEAD_SORTS = ["next_action", "score", "updated"] as const;

export const LEADS_PAGE_SIZE = 50;

export type LeadSort = (typeof LEAD_SORTS)[number];

export type LeadFilters = {
  status?: string;
  segment?: string;
  province?: string;
  wave?: string;
  kind?: string;
  source?: string;
  q?: string;
  sort?: string;
  page?: number;
};

const CLOSED: LeadStatus[] = ["won", "lost"];

export function isClosedLeadStatus(status: LeadStatus): boolean {
  return CLOSED.includes(status);
}

/** What the status bar needs to know beyond the lead's own status. */
export type LeadMoveContext = {
  /** The viewer is a platform owner — only an owner closes a sale. */
  isOwner?: boolean;
  /** Status of the linked workspace, null when the lead has none. */
  tenantStatus?: string | null;
};

/** The stage a linked workspace puts its lead at: `invited` until the admin
 * finishes the setup wizard, `pilot` once it is active. Null without a
 * workspace, or with one that is suspended or removed. */
export function leadStageOfTenant(tenantStatus: string | null | undefined): LeadStatus | null {
  if (tenantStatus === "active") return "pilot";
  if (tenantStatus === "pending" || tenantStatus === "onboarding") return "invited";
  return null;
}

/** A workspace whose lead is still invited or in pilot: removing it (or
 * revoking its invite) ends that lead, so the API wants a reason. */
export function tenantRemovalNeedsReason(leadStatus: string | null | undefined): boolean {
  return leadStatus === "invited" || leadStatus === "pilot";
}

/** Mirrors the backend state machine: which stage can be clicked from here.
 * A won lead is closed; a lost lead reopens to `contacted` only; `new`,
 * `contacted` and `demo_booked` move freely both ways. `invited` and `pilot`
 * are set by the invitation and by the workspace, never by hand — except to
 * put a lead back on the stage its workspace is really at. `won` is offered
 * to an owner, from `pilot` only, while the workspace is active. */
export function canMoveLead(current: LeadStatus, target: LeadStatus, context: LeadMoveContext = {}): boolean {
  if (target === current) return false;
  if (current === "won") return false;
  if (target === "won") {
    return current === "pilot" && !!context.isOwner && context.tenantStatus === "active";
  }
  if (current === "lost") return target === "contacted";
  if (target === "invited" || target === "pilot") return leadStageOfTenant(context.tenantStatus) === target;
  return true;
}

/** `next_action_at` (YYYY-MM-DD) strictly before today, on a lead still open.
 * Both sides are ISO date strings, so plain string comparison is correct. */
export function isLeadOverdue(
  lead: Pick<Lead, "next_action_at" | "status">,
  todayKey: string,
): boolean {
  if (!lead.next_action_at || isClosedLeadStatus(lead.status)) return false;
  return lead.next_action_at < todayKey;
}

/** An invitation the admin has not acted on for this long needs a follow-up
 * (mirrors the backend's STALE_INVITE_DAYS). */
export const STALE_INVITE_DAYS = 7;

/** Whole days between two YYYY-MM-DD keys (`to` − `from`), negative when
 * `to` is earlier. Calendar days, so no time zone can shift it. */
export function dayKeyDiff(fromKey: string, toKey: string): number {
  const utc = (key: string) => {
    const [y, m, d] = key.slice(0, 10).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(toKey) - utc(fromKey)) / 86_400_000);
}

/** Days left before the pilot's planned end: 0 on the day itself, negative
 * once it is past. Null when the lead is not in pilot or has no end date. */
export function pilotDaysLeft(
  lead: Pick<Lead, "status" | "pilot_ends_at">,
  todayKey: string,
): number | null {
  if (lead.status !== "pilot" || !lead.pilot_ends_at) return null;
  return dayKeyDiff(todayKey, lead.pilot_ends_at);
}

/** The pilot's planned end is behind us: time for the closing call. */
export function isPilotOverdue(lead: Pick<Lead, "status" | "pilot_ends_at">, todayKey: string): boolean {
  const left = pilotDaysLeft(lead, todayKey);
  return left !== null && left < 0;
}

/** Whole days since the invitation, when the lead is still `invited` more
 * than a week later (the admin has not finished the setup wizard). Null
 * otherwise — same 7 × 24 h rule as the « overdue actions » counter. */
export function staleInviteDays(
  lead: Pick<Lead, "status" | "invited_at">,
  nowMs: number,
): number | null {
  if (lead.status !== "invited" || !lead.invited_at) return null;
  const elapsed = nowMs - new Date(lead.invited_at).getTime();
  if (elapsed <= STALE_INVITE_DAYS * 86_400_000) return null;
  return Math.floor(elapsed / 86_400_000);
}

export type LeadMilestone = {
  key: "invited" | "pilot" | "won";
  at: string;
  /** Whole days since the previous milestone; null for the first one. */
  days: number | null;
};

/** The dated steps a lead went through once it had a workspace, in order,
 * each with the delay since the one before. */
export function leadMilestones(
  lead: Pick<Lead, "invited_at" | "pilot_started_at" | "won_at">,
): LeadMilestone[] {
  const steps: [LeadMilestone["key"], string | null][] = [
    ["invited", lead.invited_at],
    ["pilot", lead.pilot_started_at],
    ["won", lead.won_at],
  ];
  const out: LeadMilestone[] = [];
  for (const [key, at] of steps) {
    if (!at) continue;
    const previous = out[out.length - 1];
    out.push({ key, at, days: previous ? daysBetween(previous.at, at) : null });
  }
  return out;
}

/** Whole days from one ISO instant to another (creation → conversion). */
export function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** Filters → query string for both the page URL and the API. Empty values and
 * defaults are dropped so the URL stays short and shareable. */
export function leadsQuery(filters: LeadFilters, forApi = false): string {
  const params = new URLSearchParams();
  for (const key of ["status", "segment", "province", "wave", "kind", "source"] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  const q = filters.q?.trim();
  if (q) params.set("q", q);
  if (filters.sort && filters.sort !== "next_action") params.set("sort", filters.sort);
  const page = filters.page && filters.page > 1 ? filters.page : 1;
  if (forApi) {
    params.set("limit", String(LEADS_PAGE_SIZE));
    params.set("offset", String((page - 1) * LEADS_PAGE_SIZE));
  } else if (page > 1) {
    params.set("page", String(page));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** Reads the page's searchParams into filters, ignoring unknown values so a
 * hand-edited URL can never make the API 422. */
export function parseLeadFilters(
  raw: Record<string, string | string[] | undefined>,
): LeadFilters {
  const one = (key: string): string | undefined => {
    const value = raw[key];
    return (Array.isArray(value) ? value[0] : value) || undefined;
  };
  const within = (value: string | undefined, allowed: readonly string[]) =>
    value && allowed.includes(value) ? value : undefined;
  const province = one("province")?.toUpperCase();
  const page = Number.parseInt(one("page") ?? "1", 10);
  return {
    status: within(one("status"), LEAD_STATUSES),
    segment: within(one("segment"), LEAD_SEGMENTS),
    province: province && /^[A-Z]{2}$/.test(province) ? province : undefined,
    wave: within(one("wave")?.toUpperCase(), LEAD_WAVES),
    kind: within(one("kind"), LEAD_KINDS),
    source: within(one("source"), LEAD_SOURCES),
    q: one("q")?.slice(0, 120),
    sort: within(one("sort"), LEAD_SORTS),
    page: Number.isFinite(page) && page > 1 ? page : 1,
  };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // A cell starting with = + - @ is run as a formula by Excel; these values
  // come from the web (and soon from a public form), so neutralise them.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export type LeadCsvColumn = { header: string; value: (lead: Lead) => unknown };

/** Semicolon-separated with a BOM — opens straight in a French Excel, like
 * the payroll export. */
export function leadsToCsv(leads: Lead[], columns: LeadCsvColumn[]): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(";")];
  for (const lead of leads) {
    lines.push(columns.map((c) => csvCell(c.value(lead))).join(";"));
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** A YYYY-MM-DD calendar day, shown without any timezone shift. */
export function formatDay(day: string, locale: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Workspace address suggested for « Invite as a network »: accents dropped,
 * anything else collapsed to single hyphens — the shape the API accepts
 * (`^[a-z0-9][a-z0-9-]*[a-z0-9]$`). */
export function slugifyOrgName(name: string): string {
  return name
    .toLowerCase()
    // Ligatures have no decomposition: NFD leaves « œ » as is.
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/** "Claire Dubois-Roy" → first / last, to pre-fill the invited admin. A
 * single word is a first name; the operator completes the rest. */
export function splitContactName(name: string | null): { first: string; last: string } {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

/** A lead can be invited once, and only while it is still open. */
export function canInviteLead(lead: Pick<Lead, "status" | "tenant_id">): boolean {
  return !lead.tenant_id && !isClosedLeadStatus(lead.status);
}

/** A lead can be deleted unless it became a workspace that still exists —
 * mirrors the API's 409 (`lead.delete_has_live_tenant`). */
export function canDeleteLead(lead: Pick<Lead, "tenant_id">, tenantStatus: string | null): boolean {
  return !lead.tenant_id || tenantStatus === "removed";
}

export type LeadTenantBanner =
  | "won"
  | "removed"
  | "lost_live"
  | "suspended"
  | "behind_pilot"
  | "behind_invited"
  | "pilot"
  | "invited";

/** What the lead page says about the linked tenant. A removed tenant and a
 * lost lead whose workspace still exists must not read like progress — nor
 * a lead moved back to an earlier stage: the banner follows the LEAD, and
 * says so when the workspace is ahead of it (« behind »: put it back on
 * Pilot / Invited) or suspended. */
export function leadTenantBanner(
  lead: Pick<Lead, "status" | "won_at">,
  tenantStatus: string | null,
): LeadTenantBanner {
  if (lead.won_at) return "won";
  if (tenantStatus === "removed") return "removed";
  if (lead.status === "lost") return "lost_live";
  if (tenantStatus === "suspended") return "suspended";
  const stage = leadStageOfTenant(tenantStatus) ?? "invited";
  if (lead.status === stage) return stage === "pilot" ? "pilot" : "invited";
  return stage === "pilot" ? "behind_pilot" : "behind_invited";
}

/** The filter behind the « new requests from the website » banner. */
export const WEBSITE_REQUESTS_FILTER: LeadFilters = { status: "new", source: "website_form" };

export function isWebsiteRequestsFilter(filters: LeadFilters): boolean {
  return filters.status === "new" && filters.source === "website_form";
}
