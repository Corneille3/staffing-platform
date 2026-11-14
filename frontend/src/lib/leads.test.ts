import { describe, expect, it } from "vitest";
import {
  canMoveLead,
  daysBetween,
  isLeadOverdue,
  leadsQuery,
  leadsToCsv,
  parseLeadFilters,
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

  it("never offers won, and closes a won lead", () => {
    expect(canMoveLead("invited", "won")).toBe(false);
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
