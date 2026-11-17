"use client";

import { useTranslations } from "next-intl";
import { reasonWording } from "../lib/eligibility-chips";
import type { EligibilityReason } from "../lib/types";
import { useCredentialLabel } from "./use-credential-label";

/** FR/EN wording for an eligibility reason sent by the matching engine.
 * `full` is the whole sentence ("Manquant : Laval"); `chip` is the short form
 * used on the ranking table — a matched reason that names something shows
 * just that thing (the city, the language, the qualification). An unknown
 * reason falls back to the backend's English label. */
export function useReasonLabel() {
  const t = useTranslations("common.reasons");
  const credential = useCredentialLabel();

  const item = (value: string, kind: "city" | "language" | "credential" | undefined) => {
    if (kind === "language") return t.has(`languages.${value}`) ? t(`languages.${value}`) : value.toUpperCase();
    if (kind === "credential") return credential(value);
    return value;
  };

  const full = (reason: EligibilityReason): string => {
    const wording = reasonWording(reason);
    if (!wording) return reason.label;
    return t(wording.key, wording.item ? { item: item(wording.item, wording.itemKind) } : undefined);
  };

  const chip = (reason: EligibilityReason): string => {
    if (reason.status === "matched" && reason.code) {
      const kind =
        reason.type === "language" ? "language"
        : reason.type === "qualification" || reason.type === "certification" ? "credential"
        : "city";
      return item(reason.code, kind);
    }
    return full(reason);
  };

  return { full, chip };
}
