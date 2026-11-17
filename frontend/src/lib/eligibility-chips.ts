import type { EligibilityReason } from "./types";

export type ReasonChip = { key: string; text: string; missing: boolean; reason: EligibilityReason };

/** How to word a reason from `common.reasons`: a message key, plus the thing
 * it names (a city, a language code, a credential code) when there is one. */
export type ReasonWording = {
  key: string;
  item?: string;
  itemKind?: "city" | "language" | "credential";
};

/**
 * The backend words eligibility reasons in English (`label`) and carries no
 * stable key, so the sentence itself is the discriminator — a closed list
 * written in `matching_service.py`. Returns null for anything not recognised:
 * the caller then shows the label as sent, so a sentence added later reads in
 * English instead of breaking.
 */
export function reasonWording(reason: EligibilityReason): ReasonWording | null {
  const { type, status, label, code } = reason;
  const fixed: Record<string, string> = {
    "Missing: active worker profile": "profileInactive",
    "Missing: worker profile": "profileMissing",
    "Organization not selected": "orgNotSelected",
    "Already booked": "alreadyBooked",
    "Slot not in weekly grid": "slotNotInGrid",
    Available: "available",
    "Missing: availability": "unavailable",
    "City match": "cityMatch",
    "Language match": "languageMatch",
    "No qualification required": "noQualification",
    "No certification required": "noCertification",
    "Qualification match": "qualificationMatch",
    "Certification match": "certificationMatch",
  };
  if (fixed[label]) return { key: fixed[label] };

  const far = /^Far shift accepted: (.+)$/.exec(label);
  if (far) return { key: "farShift", item: far[1], itemKind: "city" };

  const missing = /^Missing: (.+)$/.exec(label);
  if (status === "missing" && missing) {
    if (type === "city") return { key: "missingItem", item: code ?? missing[1], itemKind: "city" };
    if (type === "language") return { key: "missingItem", item: code ?? missing[1], itemKind: "language" };
    if (type === "qualification" || type === "certification") {
      return { key: "missingItem", item: code ?? missing[1], itemKind: "credential" };
    }
  }
  return null;
}

/**
 * Chips for a ranked substitute row (pure — used by the client table, tested
 * in vitest). Missing reasons keep their label ("Missing: Montréal", "Already
 * booked", "Slot not in weekly grid") — that is the answer to "why not 100?".
 * Matched reasons that carry a code show the code (the city, the language,
 * the qualification), the rest their label. "No qualification required"
 * fillers say nothing about the worker and are dropped. Gaps come first.
 * `text` is the English wording; `useReasonLabel().chip(c.reason)` words it
 * in the page's language.
 */
export function reasonChips(reasons: EligibilityReason[]): ReasonChip[] {
  const chips = reasons
    .filter((r) => !(r.status === "matched" && r.code == null && /^No \w+ required$/.test(r.label)))
    .map((r, i) => ({
      key: `${r.type}-${r.code ?? i}`,
      text: r.status === "matched" && r.code ? r.code : r.label,
      missing: r.status === "missing",
      reason: r,
    }));
  return [...chips.filter((c) => c.missing), ...chips.filter((c) => !c.missing)];
}
