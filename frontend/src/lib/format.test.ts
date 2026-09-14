import { describe, expect, it } from "vitest";
import { orgRoleSubtitle, roleSectorSubtitle } from "./format";
import type { StaffingRequest } from "./types";

// Only the fields the subtitle helpers read.
function request(overrides: Record<string, unknown>): StaffingRequest {
  return { role: "educator", organization: null, ...overrides } as unknown as StaffingRequest;
}

describe("orgRoleSubtitle", () => {
  it("puts the organisation first, then role · sector", () => {
    const req = request({ organization: { name: "CPE Les Petites Étoiles", type: "childcare" } });
    expect(orgRoleSubtitle(req, "fr")).toBe(`CPE Les Petites Étoiles · ${roleSectorSubtitle(req, "fr")}`);
    expect(orgRoleSubtitle(req, "fr")).toMatch(/^CPE Les Petites Étoiles · /);
  });

  it("falls back to role · sector alone when the request has no organisation", () => {
    const req = request({ organization: null });
    expect(orgRoleSubtitle(req, "en")).toBe(roleSectorSubtitle(req, "en"));
    expect(orgRoleSubtitle(req, "en")).not.toBe("");
  });

  it("is just the organisation when neither role nor sector is known", () => {
    const req = request({ role: null, organization: { name: "Site X", type: "not-a-sector" } });
    expect(orgRoleSubtitle(req, "fr")).toBe("Site X");
  });
});
