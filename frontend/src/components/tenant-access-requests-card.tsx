"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { approveTenantAccessGrant, denyTenantAccessGrant } from "../lib/browser-api";
import type { TenantAccessGrant } from "../lib/types";
import { useReadOnlyVisit } from "./read-only-visit";

function fmtExpiry(value: string | null, locale: string): string {
  if (!value) return "";
  try {
    return new Date(value).toLocaleTimeString(locale === "fr" ? "fr-CA" : "en-CA", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return value;
  }
}

/** The consent side of PLATFORM_HANDOFF §2.2 — shown on the tenant admin's
 * dashboard only while there is a pending or active platform access request. */
export function TenantAccessRequestsCard({ grants }: { grants: TenantAccessGrant[] }) {
  const router = useRouter();
  const t = useTranslations("apf.access");
  const relevant = grants.filter((g) => g.status === "requested" || g.status === "active");
  if (relevant.length === 0) return null;

  return (
    <section
      style={{
        background: "var(--card)",
        border: "0.5px solid var(--line)",
        borderLeft: "3px solid var(--terra)",
        borderRadius: "var(--r-lg)",
        padding: "18px 22px",
        marginBottom: 28,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <ShieldAlert size={15} style={{ color: "var(--terra)" }} />
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{t("title")}</span>
      </div>
      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
        {t("body")}
      </p>
      {relevant.map((g) => (
        <GrantRow key={g.id} grant={g} onChanged={() => router.refresh()} />
      ))}
    </section>
  );
}

function GrantRow({ grant, onChanged }: { grant: TenantAccessGrant; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A visiting operator can see the request but never rule on it.
  const readOnlyVisit = useReadOnlyVisit();
  const t = useTranslations("apf.access");
  const locale = useLocale();

  async function run(action: "approve" | "deny") {
    setBusy(true);
    setError(null);
    try {
      if (action === "approve") await approveTenantAccessGrant(grant.id);
      else await denyTenantAccessGrant(grant.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failed"));
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
        borderTop: "0.5px solid var(--line)",
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>
          {grant.operator_name}
          <span style={{ color: "var(--ink-3)", fontWeight: 400 }}> · {grant.operator_email}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 2 }}>“{grant.reason}”</div>
      </div>
      {error ? <span style={{ fontSize: 11, color: "var(--rose)" }}>{error}</span> : null}
      {grant.status === "requested" ? (
        readOnlyVisit ? null : (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => run("deny")}
            style={{ ...btn, color: "var(--rose)" }}
          >
            {t("deny")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run("approve")}
            style={{ ...btn, background: "var(--ink)", color: "var(--paper)", borderColor: "transparent" }}
          >
            {busy ? "…" : t("approve")}
          </button>
        </div>
        )
      ) : (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--moss)", fontWeight: 500 }}>
          <ShieldCheck size={13} /> {t("activeUntil", { time: fmtExpiry(grant.expires_at, locale) })}
        </span>
      )}
    </div>
  );
}

const btn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 16px",
  borderRadius: 999,
  background: "transparent",
  border: "0.5px solid var(--line)",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "var(--ui)",
  color: "var(--ink)",
};
