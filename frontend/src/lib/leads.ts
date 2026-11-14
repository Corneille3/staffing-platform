// Pure helpers for the operator-level sales pipeline (/platform/leads).
// Server pages and client components both import from here — keep it free of
// React and of "use client".

import type { Lead, LeadStatus } from "./types";

// Display order = pipeline order (SPEC_PLATFORM_LEADS §4).
export const LEAD_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "demo_booked",
  "pilot",
  "invited",
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
  q?: string;
  sort?: string;
  page?: number;
};

const CLOSED: LeadStatus[] = ["won", "lost"];

export function isClosedLeadStatus(status: LeadStatus): boolean {
  return CLOSED.includes(status);
}

/** Mirrors the backend state machine: which stage can be clicked from here.
 * `won` is never set by hand; a won lead is closed; a lost lead reopens to
 * `contacted` only; the five open stages move freely both ways. */
export function canMoveLead(current: LeadStatus, target: LeadStatus): boolean {
  if (target === current) return false;
  if (current === "won" || target === "won") return false;
  if (current === "lost") return target === "contacted";
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

/** Whole days from one ISO instant to another (creation → conversion). */
export function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** Filters → query string for both the page URL and the API. Empty values and
 * defaults are dropped so the URL stays short and shareable. */
export function leadsQuery(filters: LeadFilters, forApi = false): string {
  const params = new URLSearchParams();
  for (const key of ["status", "segment", "province", "wave", "kind"] as const) {
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
