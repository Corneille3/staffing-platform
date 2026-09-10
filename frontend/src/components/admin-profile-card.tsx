"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Phone } from "lucide-react";
import { updateMyProfile } from "../lib/browser-api";
import type { MyProfile } from "../lib/types";
import { Eyebrow, SaveFlash, useSaveFlash } from "./ui";

/**
 * Sidebar card: the signed-in person's own mobile number + SMS switch.
 * Auto-saves (blur / Enter for the number, immediately for the switch) with
 * the shared Saved flash. Exists because coordinators could only get a phone
 * at invite time, so the no-show SMS never reached anyone invited without one.
 */
export function AdminProfileCard({ initial }: { initial: MyProfile }) {
  const t = useTranslations("admin.profile");
  const tCommon = useTranslations("common");
  const flash = useSaveFlash();
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [savedPhone, setSavedPhone] = useState(initial.phone ?? "");
  // Stored negative (sms_opt_out) but shown positive, like the worker Alertes tab.
  const [smsOn, setSmsOn] = useState(!initial.sms_opt_out);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function persist(payload: { phone?: string | null; sms_opt_out?: boolean }) {
    setBusy(true);
    setError(null);
    flash.start();
    try {
      const next = await updateMyProfile(payload);
      setPhone(next.phone ?? "");
      setSavedPhone(next.phone ?? "");
      setSmsOn(!next.sms_opt_out);
      flash.succeed();
    } catch (err) {
      flash.fail();
      setError(err instanceof Error && err.message ? err.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  function savePhone() {
    if (busy || phone.trim() === savedPhone.trim()) return;
    void persist({ phone: phone.trim() });
  }

  function toggleSms() {
    if (busy) return;
    const nextOn = !smsOn;
    setSmsOn(nextOn);
    void persist({ sms_opt_out: !nextOn });
  }

  const hasPhone = savedPhone.trim().length > 0;

  return (
    <div
      style={{
        padding: "12px 14px",
        marginBottom: 10,
        borderRadius: 10,
        background: "var(--card)",
        border: "0.5px solid var(--line)",
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <Eyebrow>{t("title")}</Eyebrow>
        <SaveFlash
          state={flash.state}
          savingLabel={tCommon("saving")}
          savedLabel={tCommon("saved")}
          style={{ marginLeft: "auto", fontSize: 11 }}
        />
      </div>

      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)", lineHeight: 1.3 }}>
        {initial.first_name} {initial.last_name}
      </div>

      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: ".12em", textTransform: "uppercase" }}>
          {t("phone")}
        </span>
        <span style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <Phone size={12} style={{ position: "absolute", left: 9, color: "var(--ink-3)", pointerEvents: "none" }} />
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            placeholder={t("phonePlaceholder")}
            disabled={busy}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={savePhone}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "7px 8px 7px 26px",
              borderRadius: 8,
              border: "0.5px solid var(--line)",
              background: "var(--paper)",
              color: "var(--ink)",
              fontSize: 12,
              fontFamily: "var(--mono)",
              minHeight: 32,
            }}
          />
        </span>
      </label>

      <button
        type="button"
        role="switch"
        aria-checked={smsOn}
        disabled={busy || !hasPhone}
        onClick={toggleSms}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: 0,
          border: 0,
          background: "transparent",
          color: "var(--ink)",
          fontSize: 12,
          fontFamily: "inherit",
          cursor: busy || !hasPhone ? "default" : "pointer",
          opacity: hasPhone ? 1 : 0.5,
          textAlign: "left",
          minHeight: 28,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 28,
            height: 16,
            borderRadius: 999,
            background: smsOn && hasPhone ? "var(--moss)" : "var(--line)",
            position: "relative",
            flexShrink: 0,
            transition: "background .15s",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 2,
              left: smsOn && hasPhone ? 14 : 2,
              width: 12,
              height: 12,
              borderRadius: 999,
              background: "#fff",
              transition: "left .15s",
            }}
          />
        </span>
        <span>{smsOn && hasPhone ? t("sms") : t("smsOff")}</span>
      </button>

      <div style={{ fontSize: 10, color: hasPhone ? "var(--ink-3)" : "#8C6B14", lineHeight: 1.4 }}>
        {hasPhone ? t("phoneHint") : t("noPhone")}
      </div>

      {error ? (
        <div style={{ fontSize: 11, color: "var(--rose)", fontWeight: 600 }}>{error}</div>
      ) : null}
    </div>
  );
}
