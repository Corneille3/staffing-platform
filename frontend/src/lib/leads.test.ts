import { describe, expect, it } from "vitest";
import {
  canInviteLead,
  canMoveLead,
  daysBetween,
  isLeadOverdue,
  leadTenantBanner,
  leadsQuery,
  leadsToCsv,
  parseLeadFilters,
  slugifyOrgName,
  splitContactName,
} from "./leads";
import type { Lead } from "./types";

describe("canMoveLead", () => {
  it("lets the open stages move both ways and skip", () => {
    expect(canMoveLead("new", "demo_booked")).toBe(true);
    expect(canMoveLead("pilot", "contacted")).toBe(true);
    expect(canMoveLead("invited", "new")).toBe(true);
  });

  it("never offers the current stage", () => {
    expect(canMoveLead("pilot", "pilot")).toBe(false);
  });

  it("offers won only to an owner with a live tenant, and closes a won lead", () => {
    expect(canMoveLead("invited", "won")).toBe(false);
    expect(canMoveLead("pilot", "won", true)).toBe(true);
    expect(canMoveLead("lost", "won", true)).toBe(false);
    expect(canMoveLead("won", "pilot", true)).toBe(false);
    expect(canMoveLead("won", "contacted")).toBe(false);
    expect(canMoveLead("won", "lost")).toBe(false);
  });

  it("reopens a lost lead to contacted only", () => {
    expect(canMoveLead("lost", "contacted")).toBe(true);
    expect(canMoveLead("lost", "pilot")).toBe(false);
    expect(canMoveLead("lost", "new")).toBe(false);
  });

  it("lets any open stage be lost", () => {
    expect(canMoveLead("new", "lost")).toBe(true);
    expect(canMoveLead("invited", "lost")).toBe(true);
  });
});

describe("isLeadOverdue", () => {
  const today = "2026-11-14";

  it("is late strictly before today", () => {
    expect(isLeadOverdue({ next_action_at: "2026-11-13", status: "contacted" }, today)).toBe(true);
    expect(isLeadOverdue({ next_action_at: "2026-11-14", status: "contacted" }, today)).toBe(false);
    expect(isLeadOverdue({ next_action_at: "2026-11-15", status: "contacted" }, today)).toBe(false);
  });

  it("is never late without a date or once closed", () => {
    expect(isLeadOverdue({ next_action_at: null, status: "new" }, today)).toBe(false);
    expect(isLeadOverdue({ next_action_at: "2026-01-01", status: "lost" }, today)).toBe(false);
    expect(isLeadOverdue({ next_action_at: "2026-01-01", status: "won" }, today)).toBe(false);
  });
});

describe("daysBetween", () => {
  it("counts whole days and never goes negative", () => {
    expect(daysBetween("2026-11-01T10:00:00Z", "2026-11-15T10:00:00Z")).toBe(14);
    expect(daysBetween("2026-11-15T10:00:00Z", "2026-11-01T10:00:00Z")).toBe(0);
  });
});

describe("leadsQuery", () => {
  it("is empty for default filters", () => {
    expect(leadsQuery({})).toBe("");
    expect(leadsQuery({ sort: "next_action", page: 1, q: "  " })).toBe("");
  });

  it("keeps only what is set, for the page URL", () => {
    expect(leadsQuery({ status: "new", wave: "A", q: " lokia ", page: 3, sort: "score" })).toBe(
      "?status=new&wave=A&q=lokia&sort=score&page=3",
    );
  });

  it("turns the page into limit/offset for the API", () => {
    expect(leadsQuery({ wave: "A", page: 3 }, true)).toBe("?wave=A&limit=50&offset=100");
    expect(leadsQuery({}, true)).toBe("?limit=50&offset=0");
  });
});

describe("parseLeadFilters", () => {
  it("accepts known values and normalises case", () => {
    expect(
      parseLeadFilters({ status: "pilot", segment: "ltc_sk", province: "sk", wave: "a", page: "2" }),
    ).toEqual({
      status: "pilot",
      segment: "ltc_sk",
      province: "SK",
      wave: "A",
      kind: undefined,
      q: undefined,
      sort: undefined,
      page: 2,
    });
  });

  it("drops anything a hand-edited URL could break the API with", () => {
    const parsed = parseLeadFilters({
      status: "exploded",
      segment: ["rpa_qc", "cpe_qc"],
      province: "Quebec",
      wave: "Z",
      sort: "random",
      page: "-4",
    });
    expect(parsed.status).toBeUndefined();
    expect(parsed.segment).toBe("rpa_qc");
    expect(parsed.province).toBeUndefined();
    expect(parsed.wave).toBeUndefined();
    expect(parsed.sort).toBeUndefined();
    expect(parsed.page).toBe(1);
  });
});

describe("leadsToCsv", () => {
  const lead = {
    org_name: 'Résidence "Le Havre"; Laval',
    notes: "=HYPERLINK(evil)",
    score: 7,
    email: null,
  } as unknown as Lead;

  it("writes a BOM, semicolons and CRLF", () => {
    const csv = leadsToCsv([lead], [
      { header: "Organisation", value: (l) => l.org_name },
      { header: "Score", value: (l) => l.score },
      { header: "Courriel", value: (l) => l.email },
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe('﻿Organisation;Score;Courriel\r\n"Résidence ""Le Havre""; Laval";7;\r\n');
  });

  it("defuses cells Excel would run as a formula", () => {
    const csv = leadsToCsv([lead], [{ header: "Notes", value: (l) => l.notes }]);
    expect(csv).toContain("\r\n'=HYPERLINK(evil)\r\n");
  });
});

describe("invite helpers", () => {
  it("suggests a slug the API accepts", () => {
    expect(slugifyOrgName("Résidence « Le Havre » — Laval")).toBe("residence-le-havre-laval");
    expect(slugifyOrgName("  CPE L'Étoile #2 ")).toBe("cpe-l-etoile-2");
    expect(slugifyOrgName("Au cœur de la vie")).toBe("au-coeur-de-la-vie");
    expect(slugifyOrgName("Œuvres Lætitia")).toBe("oeuvres-laetitia");
    expect(slugifyOrgName("———")).toBe("");
    expect(slugifyOrgName("a".repeat(59) + " b")).toBe("a".repeat(59));
  });

  it("splits a contact name into first and last", () => {
    expect(splitContactName("Claire Dubois-Roy")).toEqual({ first: "Claire", last: "Dubois-Roy" });
    expect(splitContactName("  Jean  Pierre Tremblay ")).toEqual({ first: "Jean", last: "Pierre Tremblay" });
    expect(splitContactName("Direction")).toEqual({ first: "Direction", last: "" });
    expect(splitContactName(null)).toEqual({ first: "", last: "" });
  });

  it("offers the invitation once, on an open lead", () => {
    expect(canInviteLead({ status: "pilot", tenant_id: null })).toBe(true);
    expect(canInviteLead({ status: "new", tenant_id: null })).toBe(true);
    expect(canInviteLead({ status: "invited", tenant_id: "t1" })).toBe(false);
    expect(canInviteLead({ status: "lost", tenant_id: null })).toBe(false);
    expect(canInviteLead({ status: "won", tenant_id: "t1" })).toBe(false);
  });
});

describe("leadTenantBanner", () => {
  const open = { status: "invited", converted_at: null } as const;

  it("follows the tenant while the lead is open", () => {
    expect(leadTenantBanner(open, "pending")).toBe("invited");
    expect(leadTenantBanner(open, "onboarding")).toBe("invited");
    expect(leadTenantBanner({ status: "pilot", converted_at: null }, "active")).toBe("pilot");
  });

  it("says so when the tenant is gone", () => {
    expect(leadTenantBanner(open, "removed")).toBe("removed");
    expect(leadTenantBanner({ status: "lost", converted_at: null }, "removed")).toBe("removed");
  });

  it("flags a lost lead whose workspace still exists", () => {
    expect(leadTenantBanner({ status: "lost", converted_at: null }, "active")).toBe("lost_live");
    expect(leadTenantBanner({ status: "lost", converted_at: null }, "pending")).toBe("lost_live");
  });

  it("keeps a won lead won, whatever happened to the tenant since", () => {
    expect(leadTenantBanner({ status: "won", converted_at: "2026-11-15T10:00:00Z" }, "removed")).toBe("won");
  });
});
