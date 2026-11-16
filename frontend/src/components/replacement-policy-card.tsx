"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchReplacementPolicy, updateReplacementPolicy } from "../lib/browser-api";
import type { ReplacementPolicy } from "../lib/types";
import { useReadOnlyVisit } from "./read-only-visit";
import { SaveFlash, useSaveFlash } from "./ui";

// Labels live under admin.replacements.policy.roles.
const ROLES = ["educator", "assistant_educator", "psw", "nurse", "food_handler", "other"].map((value) => ({ value }));

/** Per-org self-serve policy (§5): auto vs approval, which roles may release,
 * and the release lead-time. Auto-saves each control. */
export function ReplacementPolicyCard({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [policy, setPolicy] = useState<ReplacementPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const flash = useSaveFlash();
  // The policy stays visible to a read-only visitor; the switches are inert.
  const readOnlyVisit = useReadOnlyVisit();
  const t = useTranslations("admin.replacements.policy");
  const tCommon = useTranslations("common");

  useEffect(() => {
    let alive = true;
    fetchReplacementPolicy(organizationId)
      .then((p) => alive && setPolicy(p))
      .catch((e) => alive && setError(e instanceof Error ? e.message : t("loadFailed")));
    return () => { alive = false; };
  }, [organizationId]);

  async function save(partial: Parameters<typeof updateReplacementPolicy>[1]) {
    flash.start();
    try {
      const updated = await updateReplacementPolicy(organizationId, partial);
      setPolicy(updated);
      flash.succeed();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("saveFailed"));
      flash.fail();
    }
  }

  if (!policy) {
    return (
      <div style={card}>
        <div style={{ fontSize: 13, color: "var(--ink-3)" }}>{error ?? tCommon("loading")}</div>
      </div>
    );
  }

  const toggleRole = (value: string) => {
    const has = policy.allowed_roles.includes(value);
    const next = has
      ? policy.allowed_roles.filter((r) => r !== value)
      : [...policy.allowed_roles, value];
    save({ allowed_roles: next });
  };

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{t("title")}</div>
        <SaveFlash state={flash.state} />
      </div>
      <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5 }}>
        {organizationName}
      </p>

      {/* auto vs managed */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {(["auto", "managed"] as const).map((mode) => {
          const active = policy.policy === mode;
          return (
            <button
              key={mode}
              type="button"
              disabled={readOnlyVisit}
              onClick={() => !active && save({ policy: mode })}
              style={{
                flex: 1,
                padding: "12px 14px",
                borderRadius: 12,
                border: `0.5px solid ${active ? "var(--terra)" : "var(--line)"}`,
                background: active ? "var(--terra-soft)" : "#fff",
                cursor: readOnlyVisit ? "default" : "pointer",
                textAlign: "left",
                fontFamily: "inherit",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: active ? "var(--terra-ink)" : "var(--ink)" }}>
                {mode === "auto" ? t("auto") : t("managed")}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3, lineHeight: 1.4 }}>
                {mode === "auto"
                  ? t("autoSub")
                  : t("managedSub")}
              </div>
            </button>
          );
        })}
      </div>

      {/* allowed roles */}
      <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 500, marginBottom: 8 }}>
        {t("rolesLabel")}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 18 }}>
        {ROLES.map((r) => {
          const active = policy.allowed_roles.includes(r.value);
          return (
            <button
              key={r.value}
              type="button"
              disabled={readOnlyVisit}
              onClick={() => toggleRole(r.value)}
              style={{
                padding: "7px 13px",
                borderRadius: 99,
                border: `0.5px solid ${active ? "transparent" : "var(--line)"}`,
                background: active ? "var(--ink)" : "#fff",
                color: active ? "var(--paper)" : "var(--ink)",
                fontSize: 12.5,
                cursor: readOnlyVisit ? "default" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {t(`roles.${r.value}`)}
            </button>
          );
        })}
      </div>

      {/* lead time */}
      <label style={{ display: "block", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 500, marginBottom: 8 }}>
        {t("noticeLabel")}
      </label>
      <input
        type="number"
        min={0}
        max={1440}
        defaultValue={policy.min_release_lead_minutes}
        onBlur={(e) => {
          const v = Math.max(0, Math.min(1440, Number(e.target.value) || 0));
          if (v !== policy.min_release_lead_minutes) save({ min_release_lead_minutes: v });
        }}
        style={{
          width: 120,
          padding: "9px 12px",
          borderRadius: 10,
          border: "0.5px solid var(--line)",
          background: "var(--paper)",
          fontSize: 13,
          fontFamily: "var(--ui)",
        }}
      />
      {error && <p style={{ margin: "10px 0 0", color: "var(--rose)", fontSize: 12 }}>{error}</p>}
    </div>
  );
}

const card: React.CSSProperties = {
  background: "var(--card)",
  border: "0.5px solid var(--line)",
  borderRadius: 16,
  padding: "18px 20px",
};
