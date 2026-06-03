"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, Shield, X } from "lucide-react";
import { invitePlatformTenant, platformTenantAction } from "../lib/browser-api";
import type { PlatformTenantRow, PlatformTenantsResponse } from "../lib/types";

const STATUS_META: Record<string, { chip: string; bg: string; c: string }> = {
  active: { chip: "Active", bg: "var(--moss-soft)", c: "var(--moss)" },
  pending: { chip: "Invite sent", bg: "var(--sand-soft)", c: "#8C6B14" },
  onboarding: { chip: "Onboarding", bg: "var(--terra-soft)", c: "var(--terra-ink)" },
  suspended: { chip: "Suspended", bg: "var(--rose-soft)", c: "var(--rose)" },
};

const GRID = "2.2fr 1fr 0.7fr 0.7fr 0.9fr 1.2fr 1.4fr";

function fmtSince(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return value;
  }
}

function fillColor(rate: number | null): string {
  if (rate == null) return "var(--ink-4)";
  if (rate >= 85) return "var(--moss)";
  if (rate >= 75) return "#8C6B14";
  return "var(--rose)";
}

export function PlatformTenantsView({ data }: { data: PlatformTenantsResponse }) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);

  const { kpis, tenants } = data;
  const counts = tenants.reduce(
    (acc, t) => {
      acc[t.status] = (acc[t.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const summary = [
    counts.active ? `${counts.active} active` : null,
    counts.pending ? `${counts.pending} invited` : null,
    counts.onboarding ? `${counts.onboarding} onboarding` : null,
    counts.suspended ? `${counts.suspended} suspended` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div style={{ padding: "32px 36px", maxWidth: 1280 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="stf-h-eyebrow" style={eyebrow}>Platform · every workspace</div>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: "clamp(2rem, 4vw, 2.75rem)", lineHeight: 1.02, margin: "6px 0 0", letterSpacing: "-0.02em" }}>
            {tenants.length} {tenants.length === 1 ? "network" : "networks"} <em style={{ fontStyle: "italic" }}>on StaffiG</em>
          </h1>
          <p style={{ margin: "8px 0 0", color: "var(--ink-2)", fontSize: 14, maxWidth: 600 }}>
            Each network is an isolated tenant. Invite a new one, watch their adoption — but never see inside their data.
          </p>
          {summary ? <div style={{ marginTop: 8, fontSize: 12, color: "var(--ink-3)" }}>{summary}</div> : null}
        </div>
        <button type="button" onClick={() => setInviteOpen(true)} style={primaryBtn}>
          <Plus size={15} /> Invite a network
        </button>
      </div>

      {/* Aggregate KPIs — privacy-safe (counts only) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <PlatKpi label="Active networks" value={String(kpis.active_tenants)} sub="live workspaces" />
        <PlatKpi label="Organizations" value={String(kpis.total_orgs)} sub="across all tenants" />
        <PlatKpi label="Substitutes" value={String(kpis.total_substitutes)} sub="total identities" />
        <PlatKpi label="Network fill rate" value={kpis.weighted_fill_rate == null ? "—" : String(kpis.weighted_fill_rate)} unit={kpis.weighted_fill_rate == null ? undefined : "%"} sub="weighted average" tone="moss" />
      </div>

      {/* Tenant table */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: GRID, padding: "12px 22px", borderBottom: "0.5px solid var(--line)", fontSize: 10, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 500 }}>
          <div>Network</div><div>Region</div><div>Orgs</div><div>Subs</div><div>Fill rate</div><div>Status</div><div />
        </div>
        {tenants.length === 0 ? (
          <div style={{ padding: "28px 22px", fontSize: 13, color: "var(--ink-3)" }}>
            No networks yet. Invite your first one.
          </div>
        ) : (
          tenants.map((t, i) => (
            <TenantRow key={t.id} t={t} last={i === tenants.length - 1} onAction={() => router.refresh()} />
          ))
        )}
      </div>

      <div style={{ marginTop: 16, fontSize: 12, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 6 }}>
        <Shield size={13} /> Org / sub counts and fill rate are the only figures the operator sees. Names, shifts, and worker data stay inside each tenant.
      </div>

      {inviteOpen && <InviteTenantModal onClose={() => setInviteOpen(false)} onCreated={() => { setInviteOpen(false); router.refresh(); }} />}
    </div>
  );
}

function TenantRow({ t, last, onAction }: { t: PlatformTenantRow; last: boolean; onAction: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = STATUS_META[t.status] ?? STATUS_META.active;
  const initials = t.name.split(" ").map((p) => p[0]).slice(0, 2).join("");

  async function run(action: "suspend" | "reactivate" | "resend" | "revoke") {
    setBusy(true);
    setError(null);
    try {
      await platformTenantAction(t.id, action);
      onAction();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: GRID, padding: "14px 22px", alignItems: "center", borderBottom: last ? "none" : "0.5px solid var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0, background: t.status === "active" ? "var(--ink)" : "var(--paper-2)", color: t.status === "active" ? "var(--paper)" : "var(--ink-3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600 }}>
          {initials}
        </div>
        <div style={{ lineHeight: 1.25, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--mono)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {t.slug} · {t.admin_name ?? t.admin_email ?? "—"}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 13 }}>{t.region ?? "—"}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{t.org_count || "—"}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{t.substitute_count || "—"}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 13, color: fillColor(t.fill_rate_30d) }}>
        {t.fill_rate_30d != null ? `${t.fill_rate_30d}%` : "—"}
      </div>
      <div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 500, background: s.bg, color: s.c }}>
          <span style={{ width: 5, height: 5, borderRadius: 99, background: s.c }} />{s.chip}
        </span>
        <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 4 }}>{fmtSince(t.since)}</div>
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
        {error ? <span style={{ fontSize: 10, color: "var(--rose)" }}>{error}</span> : null}
        {t.status === "pending" && (
          <>
            <button type="button" disabled={busy} onClick={() => run("resend")} style={rowBtn}>Resend</button>
            <button type="button" disabled={busy} onClick={() => run("revoke")} style={rowBtn}>Revoke</button>
          </>
        )}
        {t.status === "active" && (
          <button type="button" disabled={busy} onClick={() => run("suspend")} style={rowBtn}>Suspend</button>
        )}
        {t.status === "suspended" && (
          <button type="button" disabled={busy} onClick={() => run("reactivate")} style={rowBtn}>Reactivate</button>
        )}
      </div>
    </div>
  );
}

function PlatKpi({ label, value, unit, sub, tone }: { label: string; value: string; unit?: string; sub?: string; tone?: "moss" }) {
  const c = tone === "moss" ? "var(--moss)" : "var(--ink)";
  return (
    <div style={{ ...card, padding: "18px 20px" }}>
      <div className="stf-h-eyebrow" style={eyebrow}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 10 }}>
        <span style={{ fontFamily: "var(--serif)", fontSize: 36, lineHeight: 1, color: c, letterSpacing: "-0.02em" }}>{value}</span>
        {unit && <span style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 16, color: "var(--ink-3)" }}>{unit}</span>}
      </div>
      {sub && <div style={{ marginTop: 8, fontSize: 11, color: "var(--ink-3)", lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

function InviteTenantModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminFirst, setAdminFirst] = useState("");
  const [adminLast, setAdminLast] = useState("");
  const [region, setRegion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || !slug.trim() || !adminEmail.trim() || !adminFirst.trim() || !adminLast.trim()) {
      setError("Network name, address, admin name, and email are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await invitePlatformTenant({
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        region: region.trim() || null,
        admin_first_name: adminFirst.trim(),
        admin_last_name: adminLast.trim(),
        admin_email: adminEmail.trim(),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invite");
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(21,20,15,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }} onClick={onClose}>
      <div style={{ ...card, width: 480, maxWidth: "100%", padding: "28px 30px", background: "#fff", boxShadow: "0 30px 80px -20px rgba(0,0,0,.4)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div className="stf-h-eyebrow" style={eyebrow}>New tenant</div>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: 28, lineHeight: 1.05, margin: "4px 0 0" }}>Invite a <em style={{ fontStyle: "italic" }}>network</em></h2>
          </div>
          <button type="button" onClick={onClose} style={{ ...rowBtn, width: 32, height: 32, borderRadius: 99, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><X size={15} /></button>
        </div>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
          We&apos;ll create an empty workspace and email the admin a sign-up link. They name their network and build it themselves.
        </p>

        <ModalField label="Network name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Réseau Laurentides" style={inputStyle} />
        </ModalField>
        <ModalField label="Workspace address (slug)">
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="reseau-laurentides" style={inputStyle} />
        </ModalField>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <ModalField label="Admin first name">
            <input value={adminFirst} onChange={(e) => setAdminFirst(e.target.value)} placeholder="Marie" style={inputStyle} />
          </ModalField>
          <ModalField label="Admin last name">
            <input value={adminLast} onChange={(e) => setAdminLast(e.target.value)} placeholder="Tremblay" style={inputStyle} />
          </ModalField>
        </div>
        <ModalField label="Admin email">
          <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="directrice@reseau.ca" style={inputStyle} />
        </ModalField>
        <ModalField label="Region (optional)">
          <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Laurentides" style={inputStyle} />
        </ModalField>

        {error ? <p style={{ margin: "4px 0 0", color: "var(--rose)", fontSize: 12 }}>{error}</p> : null}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
          <button type="button" onClick={onClose} style={rowBtn}>Cancel</button>
          <button type="button" onClick={submit} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
            <ArrowRight size={14} /> {busy ? "Sending…" : "Send invite"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 500, marginBottom: 7 }}>{label}</div>
      {children}
    </div>
  );
}

const card: React.CSSProperties = {
  background: "var(--card)",
  border: "0.5px solid var(--line)",
  borderRadius: "var(--r-lg)",
};

const eyebrow: React.CSSProperties = {
  fontSize: 11,
  color: "var(--ink-3)",
  letterSpacing: ".14em",
  textTransform: "uppercase",
  fontWeight: 500,
};

const primaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "13px 20px",
  borderRadius: 999,
  background: "var(--ink)",
  border: 0,
  color: "var(--paper)",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "var(--ui)",
};

const rowBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  borderRadius: 999,
  background: "transparent",
  border: "0.5px solid var(--line)",
  color: "var(--ink)",
  fontSize: 11,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "var(--ui)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  borderRadius: 10,
  border: "0.5px solid var(--line)",
  background: "var(--paper)",
  fontFamily: "var(--ui)",
  fontSize: 14,
  color: "var(--ink)",
  outline: "none",
  boxSizing: "border-box",
};
