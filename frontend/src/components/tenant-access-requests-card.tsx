"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { approveTenantAccessGrant, denyTenantAccessGrant } from "../lib/browser-api";
import type { TenantAccessGrant } from "../lib/types";

function fmtExpiry(value: string | null): string {
  if (!value) return "";
  try {
    return new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return value;
  }
}

/** The consent side of PLATFORM_HANDOFF §2.2 — shown on the tenant admin's
 * dashboard only while there is a pending or active platform access request. */
export function TenantAccessRequestsCard({ grants }: { grants: TenantAccessGrant[] }) {
  const router = useRouter();
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
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>StaffiG support access</span>
      </div>
      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
        A platform operator is asking to look inside your workspace. Access is read-only,
        expires automatically, and every step is logged.
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

  async function run(action: "approve" | "deny") {
    setBusy(true);
    setError(null);
    try {
      if (action === "approve") await approveTenantAccessGrant(grant.id);
      else await denyTenantAccessGrant(grant.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
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
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => run("deny")}
            style={{ ...btn, color: "var(--rose)" }}
          >
            Deny
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run("approve")}
            style={{ ...btn, background: "var(--ink)", color: "var(--paper)", borderColor: "transparent" }}
          >
            {busy ? "…" : "Approve"}
          </button>
        </div>
      ) : (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--moss)", fontWeight: 500 }}>
          <ShieldCheck size={13} /> Active until {fmtExpiry(grant.expires_at)}
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
