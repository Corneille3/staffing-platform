"use client";

import { useState } from "react";
import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { updateMyProfile } from "../lib/browser-api";
import { Eyebrow, SaveFlash, useSaveFlash } from "./ui";

/**
 * The worker's own mobile number on the Profil identity card. Saves on blur /
 * Enter through PATCH /auth/profile (E.164 normalised server-side) with the
 * shared Saved flash. Exists because a worker only got a number at APF invite
 * time: invited without one, they could never opt into SMS — the
 * « M'envoyer des textos » switch on Disponibilités is hidden without a phone.
 * `onSaved` refreshes the worker session so that switch appears right away.
 */
export function WorkerPhoneField({
  initial,
  onSaved,
}: {
  initial: string | null;
  onSaved: () => Promise<void>;
}) {
  const t = useTranslations("worker.profile");
  const tCommon = useTranslations("common");
  const flash = useSaveFlash();
  const [phone, setPhone] = useState(initial ?? "");
  const [savedPhone, setSavedPhone] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy || phone.trim() === savedPhone.trim()) return;
    setBusy(true);
    setError(null);
    flash.start();
    try {
      const next = await updateMyProfile({ phone: phone.trim() });
      setPhone(next.phone ?? "");
      setSavedPhone(next.phone ?? "");
      flash.succeed();
      await onSaved();
    } catch (err) {
      flash.fail();
      setError(err instanceof Error && err.message ? err.message : t("phoneError"));
    } finally {
      setBusy(false);
    }
  }

  const hasPhone = savedPhone.trim().length > 0;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
        <Eyebrow style={{ fontSize: 9 }}>{t("phone")}</Eyebrow>
        <SaveFlash
          state={flash.state}
          savingLabel={tCommon("saving")}
          savedLabel={tCommon("saved")}
          style={{ marginLeft: "auto", fontSize: 11 }}
        />
      </div>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <Phone size={14} style={{ position: "absolute", left: 12, color: "var(--ink-3)", pointerEvents: "none" }} />
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          placeholder={t("phonePlaceholder")}
          disabled={busy}
          aria-label={t("phone")}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          style={{
            width: 0,
            minWidth: 0,
            flex: 1,
            boxSizing: "border-box",
            minHeight: 44,
            padding: "10px 12px 10px 34px",
            borderRadius: 12,
            border: "0.5px solid var(--line)",
            background: "var(--paper)",
            color: "var(--ink)",
            fontSize: 15,
            fontWeight: 500,
            fontFamily: "var(--mono)",
          }}
        />
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 12, lineHeight: 1.4, color: hasPhone ? "var(--ink-3)" : "#8C6B14" }}>
        {hasPhone ? t("phoneHint") : t("noPhone")}
      </p>
      {error ? (
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--rose)", fontWeight: 600 }}>{error}</p>
      ) : null}
    </div>
  );
}
