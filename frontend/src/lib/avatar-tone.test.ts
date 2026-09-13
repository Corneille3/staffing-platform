import { describe, expect, it } from "vitest";
import { avatarTone } from "./avatar-tone";

describe("avatarTone", () => {
  it("is stable for the same name, whatever the case or padding", () => {
    expect(avatarTone("Wendy Worker")).toBe(avatarTone("  wendy worker "));
    expect(avatarTone("Eva Kouam")).toBe(avatarTone("Eva Kouam"));
  });

  it("only ever returns one of the three soft tones", () => {
    for (const name of ["", "A", "Bruno Bilingual", "Sophie Lavoie", "Mael Kouam", "Nora NewHire"]) {
      expect(["terra", "moss", "sand"]).toContain(avatarTone(name));
    }
  });

  it("spreads a realistic roster across all three tones", () => {
    const roster = [
      "Wendy Worker", "Bruno Bilingual", "Nora NewHire", "Owen Onboarding",
      "Sophie Lavoie", "Sophie Deux", "Sophie Trois", "Miguel Tchuembou",
      "Romario Chuela", "Eva Kouam", "Mael Kouam", "Alice Admin",
    ];
    expect(new Set(roster.map(avatarTone)).size).toBe(3);
  });
});
