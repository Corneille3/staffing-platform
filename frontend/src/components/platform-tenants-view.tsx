"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight, Eye, Plus, Shield, X } from "lucide-react";
import {
  invitePlatformTenant,
  platformTenantAction,
  releaseTenantAccessGrant,
  requestTenantAccess,
} from "../lib/browser-api";
import type { PlatformTenantRow, PlatformTenantsResponse, TenantProfile } from "../lib/types";

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

export function PlatformTenantsView({
  data,
  callerWorkspace,
  callerOperatorRole,
}: {
  data: PlatformTenantsResponse;
  // The tenant this operator can already open (own membership or active
  // §2.2 grant) — its row shows "Open workspace" instead of "Request access".
  callerWorkspace?: TenantProfile | null;
  // Tier-0 role: `support` sees a read-only table (no invite, no lifecycle
  // buttons — the backend 403s those anyway). null (dev mode) = full UI.
  callerOperatorRole?: "owner" | "operator" | "support" | null;
}) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const readOnlyOperator = callerOperatorRole === "support";

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
        {!readOnlyOperator && (
          <button type="button" onClick={() => setInviteOpen(true)} style={primaryBtn}>
            <Plus size={15} /> Invite a network
          </button>
        )}
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
            <TenantRow
              key={t.id}
              t={t}
              last={i === tenants.length - 1}
              workspace={callerWorkspace?.id === t.id ? callerWorkspace : null}
              readOnlyOperator={readOnlyOperator}
              onAction={() => router.refresh()}
            />
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

function TenantRow({
  t,
  last,
  workspace,
  readOnlyOperator,
  onAction,
}: {
  t: PlatformTenantRow;
  last: boolean;
  // Non-null when this row is the caller's own/granted workspace.
  workspace: TenantProfile | null;
  // `support` — hide lifecycle buttons (Suspend/Reactivate/Resend/Revoke).
  readOnlyOperator: boolean;
  onAction: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessOpen, setAccessOpen] = useState(false);
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
        {t.status === "pending" && !readOnlyOperator && (
          <>
            <button type="button" disabled={busy} onClick={() => run("resend")} style={rowBtn}>Resend</button>
            <button type="button" disabled={busy} onClick={() => run("revoke")} style={rowBtn}>Revoke</button>
          </>
        )}
        {t.status === "active" && (
          <>
            {workspace ? (
              <>
                <Link
                  href="/apf"
                  title={
                    workspace.via_grant
                      ? "You hold an active access grant for this workspace (read-only)"
                      : "This is your own workspace"
                  }
                  style={{ ...rowBtn, textDecoration: "none", borderColor: "var(--terra)", color: "var(--terra-ink)" }}
                >
                  <ArrowUpRight size={12} /> Open workspace
                </Link>
                {workspace.via_grant ? (
                  <button
                    type="button"
                    disabled={busy}
                    title="Give up your access grant now instead of waiting for it to expire"
                    onClick={async () => {
                      setBusy(true);
                      setError(null);
                      try {
                        await releaseTenantAccessGrant();
                        onAction();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Action failed");
                      } finally {
                        setBusy(false);
                      }
                    }}
                    style={rowBtn}
                  >
                    <X size={12} /> End visit
                  </button>
                ) : null}
              </>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => setAccessOpen(true)}
                title="Ask the tenant admin for time-boxed read-only access (PLATFORM_HANDOFF §2.2)"
                style={rowBtn}
              >
                <Eye size={12} /> Request access
              </button>
            )}
            {!readOnlyOperator && (
              <button type="button" disabled={busy} onClick={() => run("suspend")} style={rowBtn}>Suspend</button>
            )}
          </>
        )}
        {t.status === "suspended" && !readOnlyOperator && (
          <button type="button" disabled={busy} onClick={() => run("reactivate")} style={rowBtn}>Reactivate</button>
        )}
      </div>
      {accessOpen && (
        <RequestAccessModal
          tenant={t}
          onClose={() => setAccessOpen(false)}
          onDone={() => {
            setAccessOpen(false);
            onAction();
          }}
        />
      )}
    </div>
  );
}

function RequestAccessModal({
  tenant,
  onClose,
  onDone,
}: {
  tenant: PlatformTenantRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function submit() {
    if (reason.trim().length < 5) {
      setError("Give the tenant admin a real reason (min 5 characters).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const grant = await requestTenantAccess(tenant.id, reason.trim());
      setResult(
        grant.status === "active"
          ? "Access granted — read-only, auto-expires."
          : "Request sent — the tenant admin must approve it.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(21,20,15,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }} onClick={onClose}>
      <div style={{ ...card, width: 440, maxWidth: "100%", padding: "28px 30px", background: "#fff", boxShadow: "0 30px 80px -20px rgba(0,0,0,.4)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div className="stf-h-eyebrow" style={eyebrow}>Privacy exception</div>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: 26, lineHeight: 1.05, margin: "4px 0 0" }}>
              Request access to <em style={{ fontStyle: "italic" }}>{tenant.name}</em>
            </h2>
          </div>
          <button type="button" onClick={onClose} style={{ ...rowBtn, width: 32, height: 32, borderRadius: 99, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <X size={15} />
          </button>
        </div>
        {result ? (
          <>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--moss)", lineHeight: 1.5 }}>{result}</p>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" onClick={onDone} style={primaryBtn}>Done</button>
            </div>
          </>
        ) : (
          <>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
              The tenant admin sees your name and this reason. If approved, you get <strong>read-only</strong> access that auto-expires — every step is logged in both audit trails.
            </p>
            <ModalField label="Reason">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Investigating support ticket #42 — a request won't publish"
                rows={3}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--ui)" }}
              />
            </ModalField>
            {error ? <p style={{ margin: "4px 0 0", color: "var(--rose)", fontSize: 12 }}>{error}</p> : null}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button type="button" onClick={onClose} style={rowBtn}>Cancel</button>
              <button type="button" onClick={submit} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
                <ArrowRight size={14} /> {busy ? "Sending…" : "Send request"}
              </button>
            </div>
          </>
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
  const [language, setLanguage] = useState<"fr" | "en" | "bilingual">("fr");
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
        admin_preferred_language: language,
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
        <ModalField label="Admin language">
          <div style={{ display: "flex", gap: 8 }}>
            {([["fr", "Français"], ["en", "English"], ["bilingual", "Bilingue"]] as const).map(([code, label]) => {
              const active = language === code;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLanguage(code)}
                  style={{
                    flex: 1,
                    padding: "9px 0",
                    borderRadius: 10,
                    cursor: "pointer",
                    fontFamily: "var(--ui)",
                    fontSize: 13,
                    background: active ? "var(--ink)" : "#fff",
                    color: active ? "var(--paper)" : "var(--ink)",
                    border: `0.5px solid ${active ? "transparent" : "var(--line)"}`,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
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
