"use client";

import { Link, usePathname, useRouter } from "../i18n/navigation";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, ArrowUpRight, Eye, Plus, Shield, Trash2, X } from "lucide-react";
import { SaveFlash, useSaveFlash } from "./ui";
import {
  invitePlatformTenant,
  platformTenantAction,
  releaseTenantAccessGrant,
  removeNetwork,
  requestTenantAccess,
} from "../lib/browser-api";
import { tenantRemovalNeedsReason } from "../lib/leads";
import type { PlatformTenantRow, PlatformTenantsResponse, TenantProfile } from "../lib/types";

// Colours only — the chip's wording comes from `platform.tenants.status`.
const STATUS_META: Record<string, { bg: string; c: string }> = {
  active: { bg: "var(--moss-soft)", c: "var(--moss)" },
  pending: { bg: "var(--sand-soft)", c: "#8C6B14" },
  onboarding: { bg: "var(--terra-soft)", c: "var(--terra-ink)" },
  suspended: { bg: "var(--rose-soft)", c: "var(--rose)" },
};

const GRID = "2.2fr 1fr 0.6fr 0.6fr 0.8fr 1.1fr 1.2fr 1.4fr";

function fmtSince(value: string | null, locale: string): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", { year: "numeric", month: "short", day: "numeric" });
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
  focusTenantId = null,
}: {
  data: PlatformTenantsResponse;
  // Set when the page is opened from a sales lead (?tenant=<id>): the table
  // shows that workspace only, with a way back to the full list.
  focusTenantId?: string | null;
  // The tenant this operator can already open (own membership or active
  // §2.2 grant) — its row shows "Open workspace" instead of "Request access".
  callerWorkspace?: TenantProfile | null;
  // Tier-0 role: `support` sees a read-only table (no invite, no lifecycle
  // buttons — the backend 403s those anyway). null (dev mode) = full UI.
  callerOperatorRole?: "owner" | "operator" | "support" | "marketing" | null;
}) {
  const tLeads = useTranslations("platform.leads");
  const tt = useTranslations("platform.tenants");
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const readOnlyOperator = callerOperatorRole === "support";

  const { kpis, tenants } = data;
  const focused = focusTenantId ? tenants.find((t) => t.id === focusTenantId) ?? null : null;
  const rows = focused ? [focused] : tenants;
  const pathname = usePathname();
  const counts = tenants.reduce(
    (acc, t) => {
      acc[t.status] = (acc[t.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const summary = [
    counts.active ? tt("summary.active", { count: counts.active }) : null,
    counts.pending ? tt("summary.pending", { count: counts.pending }) : null,
    counts.onboarding ? tt("summary.onboarding", { count: counts.onboarding }) : null,
    counts.suspended ? tt("summary.suspended", { count: counts.suspended }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div style={{ padding: "32px 36px", maxWidth: 1280 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="stf-h-eyebrow" style={eyebrow}>{tt("eyebrow")}</div>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: "clamp(2rem, 4vw, 2.75rem)", lineHeight: 1.02, margin: "6px 0 0", letterSpacing: "-0.02em" }}>
            {tt.rich("headline", { count: tenants.length, em: (chunks) => <em style={{ fontStyle: "italic" }}>{chunks}</em> })}
          </h1>
          <p style={{ margin: "8px 0 0", color: "var(--ink-2)", fontSize: 14, maxWidth: 600 }}>
            {tt("description")}
          </p>
          {summary ? <div style={{ marginTop: 8, fontSize: 12, color: "var(--ink-3)" }}>{summary}</div> : null}
        </div>
        {!readOnlyOperator && (
          <button type="button" onClick={() => setInviteOpen(true)} style={primaryBtn}>
            <Plus size={15} /> {tt("invite")}
          </button>
        )}
      </div>

      {/* Aggregate KPIs — privacy-safe (counts only) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <PlatKpi label={tt("kpi.active")} value={String(kpis.active_tenants)} sub={tt("kpi.activeSub")} />
        <PlatKpi label={tt("kpi.orgs")} value={String(kpis.total_orgs)} sub={tt("kpi.orgsSub")} />
        <PlatKpi label={tt("kpi.subs")} value={String(kpis.total_substitutes)} sub={tt("kpi.subsSub")} />
        <PlatKpi label={tt("kpi.fill")} value={kpis.weighted_fill_rate == null ? "—" : String(kpis.weighted_fill_rate)} unit={kpis.weighted_fill_rate == null ? undefined : "%"} sub={tt("kpi.fillSub")} tone="moss" />
      </div>

      {focusTenantId ? (
        <div role="status" style={{ ...card, padding: "12px 18px", marginBottom: 14, background: focused ? "var(--sand-soft)" : "var(--paper-2)", borderColor: "transparent", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 13 }}>
          <span style={{ flex: 1, minWidth: 220 }}>
            {focused ? tLeads("tenants.focused", { name: focused.name }) : tLeads("tenants.focusMissing")}
          </span>
          <Link href={pathname} style={{ ...rowBtn, textDecoration: "none", background: "#fff", color: "var(--ink)" }}>
            {tLeads("tenants.showAll")}
          </Link>
        </div>
      ) : null}

      {/* Tenant table */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: GRID, padding: "12px 22px", borderBottom: "0.5px solid var(--line)", fontSize: 10, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 500 }}>
          <div>{tt("col.network")}</div><div>{tt("col.region")}</div><div>{tt("col.orgs")}</div><div>{tt("col.subs")}</div><div>{tt("col.fill")}</div><div>{tLeads("tenants.origin")}</div><div>{tt("col.status")}</div><div />
        </div>
        {tenants.length === 0 ? (
          <div style={{ padding: "28px 22px", fontSize: 13, color: "var(--ink-3)" }}>
            {tt("empty")}
          </div>
        ) : (
          rows.map((t, i) => (
            <TenantRow
              key={t.id}
              t={t}
              last={i === rows.length - 1}
              workspace={callerWorkspace?.id === t.id ? callerWorkspace : null}
              readOnlyOperator={readOnlyOperator}
              onAction={() => router.refresh()}
            />
          ))
        )}
      </div>

      <div style={{ marginTop: 16, fontSize: 12, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 6 }}>
        <Shield size={13} /> {tt("footnote")}
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
  const tt = useTranslations("platform.tenants");
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessOpen, setAccessOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const s = STATUS_META[t.status] ?? STATUS_META.active;
  // Own workspace (not a §2.2 visit) can never be removed — backend refuses too.
  const canRemove = !readOnlyOperator && !(workspace && !workspace.via_grant);
  const initials = t.name.split(" ").map((p) => p[0]).slice(0, 2).join("");

  // Re-sending an invite changes nothing on the row, so it says so itself —
  // without this the button looked inert (user's finding, 2026-11-19).
  const resendFlash = useSaveFlash(4000);

  async function run(action: "suspend" | "reactivate" | "resend" | "revoke") {
    setBusy(true);
    setError(null);
    if (action === "resend") resendFlash.start();
    try {
      await platformTenantAction(t.id, action);
      if (action === "resend") resendFlash.succeed();
      onAction();
    } catch (err) {
      if (action === "resend") resendFlash.fail();
      setError(err instanceof Error ? err.message : tt("actionFailed"));
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
      <LeadOrigin segment={t.lead_segment} source={t.lead_source} />
      <div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 500, background: s.bg, color: s.c }}>
          <span style={{ width: 5, height: 5, borderRadius: 99, background: s.c }} />{tt.has(`status.${t.status}`) ? tt(`status.${t.status}`) : t.status}
        </span>
        {/* The workspace is a prospect's trial, not a signed client yet. */}
        {t.lead_status === "pilot" ? (
          <span title={tt("pilotBadgeTitle")} style={{ display: "inline-flex", marginLeft: 6, padding: "3px 8px", borderRadius: 999, fontSize: 10.5, fontWeight: 500, background: "var(--terra-soft)", color: "var(--terra-ink)" }}>
            {tt("pilotBadge")}
          </span>
        ) : null}
        <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 4 }}>{fmtSince(t.since, locale)}</div>
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
        {error ? <span style={{ fontSize: 10, color: "var(--rose)" }}>{error}</span> : null}
        <span role="status">
          <SaveFlash state={resendFlash.state} savingLabel={tt("resending")} savedLabel={tt("resent")} style={{ fontSize: 11 }} />
        </span>
        {t.status === "pending" && !readOnlyOperator && (
          <>
            <button type="button" disabled={busy} onClick={() => run("resend")} style={rowBtn}>{tt("resend")}</button>
            <button
              type="button"
              disabled={busy}
              // An invite that came from a sales lead closes that lead: the
              // modal asks for the reason first.
              onClick={() => (tenantRemovalNeedsReason(t.lead_status) ? setRevokeOpen(true) : run("revoke"))}
              style={rowBtn}
            >
              {tt("revoke")}
            </button>
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
                      ? tt("grantTitle")
                      : tt("ownTitle")
                  }
                  style={{ ...rowBtn, textDecoration: "none", borderColor: "var(--terra)", color: "var(--terra-ink)" }}
                >
                  <ArrowUpRight size={12} /> {tt("openWorkspace")}
                </Link>
                {workspace.via_grant ? (
                  <button
                    type="button"
                    disabled={busy}
                    title={tt("endVisitTitle")}
                    onClick={async () => {
                      setBusy(true);
                      setError(null);
                      try {
                        await releaseTenantAccessGrant();
                        onAction();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : tt("actionFailed"));
                      } finally {
                        setBusy(false);
                      }
                    }}
                    style={rowBtn}
                  >
                    <X size={12} /> {tt("endVisit")}
                  </button>
                ) : null}
              </>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => setAccessOpen(true)}
                title={tt("requestAccessTitle")}
                style={rowBtn}
              >
                <Eye size={12} /> {tt("requestAccess")}
              </button>
            )}
            {!readOnlyOperator && (
              <button type="button" disabled={busy} onClick={() => setSuspendOpen(true)} style={rowBtn}>{tt("suspend")}</button>
            )}
            {canRemove && (
              <button type="button" disabled={busy} onClick={() => setRemoveOpen(true)} style={dangerBtn}>
                <Trash2 size={12} /> {tt("remove")}
              </button>
            )}
          </>
        )}
        {t.status === "suspended" && !readOnlyOperator && (
          <>
            <button type="button" disabled={busy} onClick={() => run("reactivate")} style={rowBtn}>{tt("reactivate")}</button>
            {canRemove && (
              <button type="button" disabled={busy} onClick={() => setRemoveOpen(true)} style={dangerBtn}>
                <Trash2 size={12} /> {tt("remove")}
              </button>
            )}
          </>
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
      {suspendOpen && (
        <SuspendTenantModal
          tenant={t}
          busy={busy}
          onClose={() => setSuspendOpen(false)}
          onConfirm={async () => {
            await run("suspend");
            setSuspendOpen(false);
          }}
        />
      )}
      {removeOpen && (
        <RemoveTenantModal
          tenant={t}
          onClose={() => setRemoveOpen(false)}
          onDone={() => {
            setRemoveOpen(false);
            onAction();
          }}
        />
      )}
      {revokeOpen && (
        <RemoveTenantModal
          tenant={t}
          revoke
          onClose={() => setRevokeOpen(false)}
          onDone={() => {
            setRevokeOpen(false);
            onAction();
          }}
        />
      )}
    </div>
  );
}

function SuspendTenantModal({
  tenant,
  busy,
  onClose,
  onConfirm,
}: {
  tenant: PlatformTenantRow;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const tt = useTranslations("platform.tenants");
  const tc = useTranslations("common");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(21,20,15,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }} onClick={() => !busy && onClose()}>
      <div style={{ ...card, width: 460, maxWidth: "100%", padding: "28px 30px", background: "#fff", boxShadow: "0 30px 80px -20px rgba(0,0,0,.4)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div className="stf-h-eyebrow" style={{ ...eyebrow, color: "var(--terra)" }}>{tt("suspendModal.eyebrow")}</div>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: 26, lineHeight: 1.05, margin: "4px 0 0" }}>
              {tt.rich("suspendModal.title", { name: tenant.name, em: (chunks) => <em style={{ fontStyle: "italic" }}>{chunks}</em> })}
            </h2>
          </div>
          <button type="button" onClick={onClose} style={{ ...rowBtn, width: 32, height: 32, borderRadius: 99, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <X size={15} />
          </button>
        </div>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
          {tt.rich("suspendModal.body", { b: (chunks) => <strong>{chunks}</strong> })}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} disabled={busy} style={rowBtn}>{tc("cancel")}</button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}
          >
            {busy ? tt("suspendModal.suspending") : tt("suspendModal.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

function RemoveTenantModal({
  tenant,
  revoke = false,
  onClose,
  onDone,
}: {
  tenant: PlatformTenantRow;
  // Revoking a pending invite instead of removing a live network — same
  // modal, shown only when the invite came from a sales lead.
  revoke?: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const tt = useTranslations("platform.tenants");
  const tc = useTranslations("common");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  // The lead behind this workspace is still invited or in pilot: it will be
  // closed as lost, with the reason typed here.
  const needsReason = tenantRemovalNeedsReason(tenant.lead_status);
  const copy = revoke ? "revokeModal" : "removeModal";

  async function confirm() {
    const why = reason.trim();
    if (needsReason && !why) {
      setError(tt("removeModal.needReason"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (revoke) await platformTenantAction(tenant.id, "revoke", why || undefined);
      else await removeNetwork(tenant.id, why || undefined);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : tt("removeModal.failed"));
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(21,20,15,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }} onClick={() => !busy && onClose()}>
      <div style={{ ...card, width: 460, maxWidth: "100%", padding: "28px 30px", background: "#fff", boxShadow: "0 30px 80px -20px rgba(0,0,0,.4)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div className="stf-h-eyebrow" style={{ ...eyebrow, color: "var(--rose)" }}>{tt("removeModal.eyebrow")}</div>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: 26, lineHeight: 1.05, margin: "4px 0 0" }}>
              {tt.rich(`${copy}.title`, { name: tenant.name, em: (chunks) => <em style={{ fontStyle: "italic" }}>{chunks}</em> })}
            </h2>
          </div>
          <button type="button" onClick={onClose} style={{ ...rowBtn, width: 32, height: 32, borderRadius: 99, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <X size={15} />
          </button>
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
          {tt.rich(`${copy}.body`, { b: (chunks) => <strong>{chunks}</strong> })}
        </p>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
          {tt("removeModal.note")}
        </p>
        {needsReason ? (
          <div style={{ margin: "0 0 18px", padding: "12px 14px", borderRadius: 10, background: "var(--sand-soft)", border: "0.5px solid var(--line)" }}>
            <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
              {tt(tenant.lead_status === "pilot" ? "removeModal.leadPilot" : "removeModal.leadInvited")}
            </p>
            <label style={{ display: "block", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 500, marginBottom: 6 }} htmlFor="tenant-removal-reason">
              {tt("removeModal.reasonLabel")}
            </label>
            <textarea
              id="tenant-removal-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder={tt("removeModal.reasonPlaceholder")}
              disabled={busy}
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 8, border: "0.5px solid var(--line)", fontFamily: "var(--ui)", fontSize: 13, resize: "vertical", background: "#fff" }}
            />
          </div>
        ) : null}
        {error ? <p style={{ margin: "0 0 12px", color: "var(--rose)", fontSize: 12 }}>{error}</p> : null}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} disabled={busy} style={rowBtn}>{tc("cancel")}</button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            style={{ ...primaryBtn, background: "var(--rose)", opacity: busy ? 0.6 : 1 }}
          >
            <Trash2 size={14} /> {busy ? tt(`${copy}.removing`) : tt(`${copy}.confirm`)}
          </button>
        </div>
      </div>
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
  const tt = useTranslations("platform.tenants");
  const tc = useTranslations("common");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function submit() {
    if (reason.trim().length < 5) {
      setError(tt("accessModal.needReason"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const grant = await requestTenantAccess(tenant.id, reason.trim());
      setResult(
        grant.status === "active"
          ? tt("accessModal.granted")
          : tt("accessModal.sent"),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : tt("accessModal.failed"));
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(21,20,15,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }} onClick={onClose}>
      <div style={{ ...card, width: 440, maxWidth: "100%", padding: "28px 30px", background: "#fff", boxShadow: "0 30px 80px -20px rgba(0,0,0,.4)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div className="stf-h-eyebrow" style={eyebrow}>{tt("accessModal.eyebrow")}</div>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: 26, lineHeight: 1.05, margin: "4px 0 0" }}>
              {tt.rich("accessModal.title", { name: tenant.name, em: (chunks) => <em style={{ fontStyle: "italic" }}>{chunks}</em> })}
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
              <button type="button" onClick={onDone} style={primaryBtn}>{tt("accessModal.done")}</button>
            </div>
          </>
        ) : (
          <>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
              {tt.rich("accessModal.body", { b: (chunks) => <strong>{chunks}</strong> })}
            </p>
            <ModalField label={tt("accessModal.reason")}>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={tt("accessModal.placeholder")}
                rows={3}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--ui)" }}
              />
            </ModalField>
            {error ? <p style={{ margin: "4px 0 0", color: "var(--rose)", fontSize: 12 }}>{error}</p> : null}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button type="button" onClick={onClose} style={rowBtn}>{tc("cancel")}</button>
              <button type="button" onClick={submit} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
                <ArrowRight size={14} /> {busy ? tt("accessModal.sending") : tt("accessModal.send")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Where the tenant came from: the segment and source of its sales lead. */
function LeadOrigin({ segment, source }: { segment: string | null; source: string | null }) {
  const tLeads = useTranslations("platform.leads");
  if (!segment) return <div style={{ fontSize: 13, color: "var(--ink-4)" }}>—</div>;
  const label = (group: string, code: string) => (tLeads.has(`${group}.${code}`) ? tLeads(`${group}.${code}`) : code);
  return (
    <div style={{ lineHeight: 1.3, minWidth: 0 }}>
      <div style={{ fontSize: 12.5 }}>{label("segment", segment)}</div>
      {source ? <div style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{label("source", source)}</div> : null}
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
  const tt = useTranslations("platform.tenants");
  const tc = useTranslations("common");
  const tLeads = useTranslations("platform.leads.inviteModal");
  const tLang = useTranslations("admin.languageNames");
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
      setError(tt("inviteModal.required"));
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
      setError(err instanceof Error ? err.message : tt("inviteModal.failed"));
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(21,20,15,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }} onClick={onClose}>
      <div style={{ ...card, width: 480, maxWidth: "100%", padding: "28px 30px", background: "#fff", boxShadow: "0 30px 80px -20px rgba(0,0,0,.4)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div className="stf-h-eyebrow" style={eyebrow}>{tt("inviteModal.eyebrow")}</div>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: 28, lineHeight: 1.05, margin: "4px 0 0" }}>{tt.rich("inviteModal.title", { em: (chunks) => <em style={{ fontStyle: "italic" }}>{chunks}</em> })}</h2>
          </div>
          <button type="button" onClick={onClose} style={{ ...rowBtn, width: 32, height: 32, borderRadius: 99, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><X size={15} /></button>
        </div>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
          {tt("inviteModal.body")}
        </p>

        <ModalField label={tLeads("name")}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tt("inviteModal.namePlaceholder")} style={inputStyle} />
        </ModalField>
        <ModalField label={tLeads("slug")}>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="reseau-laurentides" style={inputStyle} />
        </ModalField>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <ModalField label={tLeads("firstName")}>
            <input value={adminFirst} onChange={(e) => setAdminFirst(e.target.value)} placeholder="Marie" style={inputStyle} />
          </ModalField>
          <ModalField label={tLeads("lastName")}>
            <input value={adminLast} onChange={(e) => setAdminLast(e.target.value)} placeholder="Tremblay" style={inputStyle} />
          </ModalField>
        </div>
        <ModalField label={tLeads("email")}>
          <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="directrice@reseau.ca" style={inputStyle} />
        </ModalField>
        <ModalField label={tLeads("region")}>
          <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Laurentides" style={inputStyle} />
        </ModalField>
        <ModalField label={tLeads("language")}>
          <div style={{ display: "flex", gap: 8 }}>
            {(["fr", "en", "bilingual"] as const).map((code) => {
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
                  {tLang(code)}
                </button>
              );
            })}
          </div>
        </ModalField>

        {error ? <p style={{ margin: "4px 0 0", color: "var(--rose)", fontSize: 12 }}>{error}</p> : null}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
          <button type="button" onClick={onClose} style={rowBtn}>{tc("cancel")}</button>
          <button type="button" onClick={submit} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
            <ArrowRight size={14} /> {busy ? tt("inviteModal.sending") : tt("inviteModal.send")}
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

const dangerBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  borderRadius: 999,
  background: "transparent",
  border: "0.5px solid var(--rose)",
  color: "var(--rose)",
  fontSize: 11,
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
