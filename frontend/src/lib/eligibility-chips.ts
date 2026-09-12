import type { EligibilityReason } from "./types";

export type ReasonChip = { key: string; text: string; missing: boolean };

/**
 * Chips for a ranked substitute row (pure — used by the client table, tested
 * in vitest). Missing reasons keep their label ("Missing: Montréal", "Already
 * booked", "Slot not in weekly grid") — that is the answer to "why not 100?".
 * Matched reasons that carry a code show the code (the city, the language,
 * the qualification), the rest their label. "No qualification required"
 * fillers say nothing about the worker and are dropped. Gaps come first.
 */
export function reasonChips(reasons: EligibilityReason[]): ReasonChip[] {
  const chips = reasons
    .filter((r) => !(r.status === "matched" && r.code == null && /^No \w+ required$/.test(r.label)))
    .map((r, i) => ({
      key: `${r.type}-${r.code ?? i}`,
      text: r.status === "matched" && r.code ? r.code : r.label,
      missing: r.status === "missing",
    }));
  return [...chips.filter((c) => c.missing), ...chips.filter((c) => !c.missing)];
}
