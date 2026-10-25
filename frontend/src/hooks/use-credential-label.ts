"use client";

import { useTranslations } from "next-intl";

/** FR/EN display label for a stored credential code (ECE_LEVEL_1, FIRST_AID,
 * …). Codes come from onboarding: suggested chips or anything the worker
 * typed, upper-cased. A known code gets its `worker.credentials` label; an
 * unknown free-typed one shows as stored rather than blank. The stored value
 * never changes — only how it reads. */
export function useCredentialLabel() {
  const t = useTranslations("worker.credentials");
  return (code: string) => (t.has(code) ? t(code) : code);
}
