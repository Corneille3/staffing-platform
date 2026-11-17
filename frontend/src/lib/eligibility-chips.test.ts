import { describe, expect, it } from "vitest";
import { reasonChips, reasonWording } from "./eligibility-chips";
import type { EligibilityReason } from "./types";

const r = (
  type: EligibilityReason["type"],
  status: EligibilityReason["status"],
  label: string,
  code: string | null = null,
): EligibilityReason => ({ type, status, label, code });

describe("reasonChips", () => {
  it("drops the 'No X required' fillers and keeps every other matched reason", () => {
    const chips = reasonChips([
      r("availability", "matched", "Available"),
      r("qualification", "matched", "No qualification required"),
      r("certification", "matched", "No certification required"),
    ]);
    expect(chips.map((c) => c.text)).toEqual(["Available"]);
    expect(chips.every((c) => !c.missing)).toBe(true);
  });

  it("shows the code for matched reasons that carry one, the label otherwise", () => {
    const chips = reasonChips([
      r("city", "matched", "City match", "Montréal"),
      r("language", "matched", "Language match", "fr"),
      r("qualification", "matched", "Qualification match", "educator"),
      r("language", "matched", "Language match"),
    ]);
    expect(chips.map((c) => c.text)).toEqual(["Montréal", "fr", "educator", "Language match"]);
  });

  it("puts missing reasons first, with their full label", () => {
    const chips = reasonChips([
      r("availability", "matched", "Available"),
      r("city", "missing", "Missing: Laval", "Laval"),
      r("language", "matched", "Language match", "fr"),
      r("qualification", "missing", "Missing: nurse", "nurse"),
    ]);
    expect(chips.map((c) => [c.text, c.missing])).toEqual([
      ["Missing: Laval", true],
      ["Missing: nurse", true],
      ["Available", false],
      ["fr", false],
    ]);
  });

  it("keeps a hard stop like 'Already booked' as the only chip", () => {
    const booked = r("availability", "missing", "Already booked");
    expect(reasonChips([booked])).toEqual([
      { key: "availability-0", text: "Already booked", missing: true, reason: booked },
    ]);
  });
});

describe("reasonWording", () => {
  it("recognises the fixed sentences", () => {
    expect(reasonWording(r("availability", "missing", "Already booked"))).toEqual({ key: "alreadyBooked" });
    expect(reasonWording(r("availability", "missing", "Slot not in weekly grid"))).toEqual({ key: "slotNotInGrid" });
    expect(reasonWording(r("availability", "missing", "Missing: availability", "unavailable"))).toEqual({ key: "unavailable" });
    expect(reasonWording(r("qualification", "matched", "No qualification required"))).toEqual({ key: "noQualification" });
  });

  it("names the city of a far shift", () => {
    expect(reasonWording(r("city", "matched", "Far shift accepted: Laval"))).toEqual({
      key: "farShift", item: "Laval", itemKind: "city",
    });
  });

  it("says what is missing, by kind", () => {
    expect(reasonWording(r("city", "missing", "Missing: Laval", "Laval"))).toEqual({
      key: "missingItem", item: "Laval", itemKind: "city",
    });
    expect(reasonWording(r("language", "missing", "Missing: FR", "fr"))).toEqual({
      key: "missingItem", item: "fr", itemKind: "language",
    });
    expect(reasonWording(r("certification", "missing", "Missing: FIRST_AID", "FIRST_AID"))).toEqual({
      key: "missingItem", item: "FIRST_AID", itemKind: "credential",
    });
  });

  it("is null for a sentence it does not know", () => {
    expect(reasonWording(r("profile", "missing", "Some new rule"))).toBeNull();
  });
});
