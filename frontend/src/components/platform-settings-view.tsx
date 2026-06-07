"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Lock, Plus, Shield, ShieldCheck, ShieldOff, X } from "lucide-react";
import { HousekeepingCard } from "./housekeeping-card";
import { SaveFlash, useSaveFlash } from "./ui";
import {
  changePlatformOperatorRole,
  invitePlatformOperator,
  removePlatformOperator,
  resendPlatformOperatorInvite,
  updatePlatformSettings,
} from "../lib/browser-api";
import type {
  PlatformOperator,
  PlatformOperatorsResponse,
  PlatformSettings,
  TenantAccessGrantsResponse,
} from "../lib/types";

const ROLE_LEGEND: { role: string; title: string; blurb: string; tone: string }[] = [
  {
    role: "owner",
    title: "Owner",
    blurb: "Everything — operators, billing & plans, tenants, access requests.",
    tone: "var(--terra)",
  },
  {
    role: "operator",
    title: "Operator",
    blurb: "Invite & suspend tenants, request tenant access. No operator or billing edits.",
    tone: "var(--moss)",
  },
  {
    role: "support",
    title: "Support",
    blurb: "Read-only. Can request time-boxed tenant access with approval.",
    tone: "var(--ink-3)",
  },
];

const GRID = "2.2fr 1fr 1fr 1fr 1.6fr";

function fmtDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return value;
  }
}

export function PlatformSettingsView({
  operators,
  settings,
  grants,
  viewerEmail,
}: {
  operators: PlatformOperatorsResponse | null;
  settings: PlatformSettings;
  grants: TenantAccessGrantsResponse | null;
  viewerEmail: string | null;
}) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const isOwner = operators?.viewer_role === "owner";

  return (
    <div style={{ padding: "32px 36px", maxWidth: 1100 }}>
      <div style={{ marginBottom: 26 }}>
        <div className="stf-h-eyebrow" style={eyebrow}>Platform · running StaffiG</div>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: "clamp(2rem, 4vw, 2.75rem)", lineHeight: 1.02, margin: "6px 0 0", letterSpacing: "-0.02em" }}>
          Settings for the <em style={{ fontStyle: "italic" }}>operator</em>
        </h1>
        <p style={{ margin: "8px 0 0", color: "var(--ink-2)", fontSize: 14, maxWidth: 620 }}>
          Who runs tier 0, what new tenants inherit, and which workspace addresses stay reserved.
        </p>
      </div>

      {/* ── §2.1 Operators & access ─────────────────────────────────────── */}
      <SectionHead
        title="Operators & access"
        sub="Every tier-0 account. Keep this list short — each row can see aggregate data across all tenants."
        action={
          operators ? (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              disabled={!isOwner}
              title={isOwner ? undefined : "Only an owner can add operators"}
              style={{ ...primaryBtn, opacity: isOwner ? 1 : 0.45, cursor: isOwner ? "pointer" : "not-allowed" }}
            >
              <Plus size={15} /> Add operator
            </button>
          ) : null
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 16 }}>
        {ROLE_LEGEND.map((r) => (
          <div key={r.role} style={{ ...card, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: r.tone }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{r.title}</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.45 }}>{r.blurb}</div>
          </div>
        ))}
      </div>

      {operators ? (
        <div style={{ ...card, padding: 0, overflow: "hidden", marginBottom: 36 }}>
          <div style={{ display: "grid", gridTemplateColumns: GRID, padding: "12px 22px", borderBottom: "0.5px solid var(--line)", fontSize: 10, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 500 }}>
            <div>Person</div><div>Role</div><div>2FA</div><div>Last active</div><div />
          </div>
          {operators.operators.map((op, i) => (
            <OperatorRow
              key={op.id}
              op={op}
              isOwner={isOwner}
              isSelf={viewerEmail != null && op.email.toLowerCase() === viewerEmail.toLowerCase()}
              last={i === operators.operators.length - 1}
              onChanged={() => router.refresh()}
            />
          ))}
        </div>
      ) : (
        <div style={{ ...card, padding: "22px 24px", marginBottom: 36, fontSize: 13, color: "var(--ink-3)" }}>
          The operator list is visible to owners and operators only.
        </div>
      )}

      {/* ── §2.2 Tenant access (the privacy exception) ──────────────────── */}
      <SectionHead
        title="Tenant access"
        sub="How an operator may look inside a tenant when support requires it. Logged, consented, time-boxed."
      />
      <TenantAccessCard
        settings={settings}
        grants={grants}
        isOwner={isOwner}
        onSaved={() => router.refresh()}
      />

      {/* ── §2.3 New-tenant defaults ────────────────────────────────────── */}
      <SectionHead
        title="New-tenant defaults"
        sub="Applied when a tenant is invited. Tenants can change most of these inside their own workspace."
      />
      <DefaultsCard settings={settings} isOwner={isOwner} onSaved={() => router.refresh()} />

      {/* ── §2.4 Reserved slugs ─────────────────────────────────────────── */}
      <SectionHead
        title="Reserved workspace addresses"
        sub="A tenant invite whose slug is on this list is rejected — protects system routes."
      />
      <ReservedSlugsCard settings={settings} isOwner={isOwner} onSaved={() => router.refresh()} />

      {/* ── Housekeeping ────────────────────────────────────────────────── */}
      <SectionHead
        title="Housekeeping"
        sub="Orphan accounts — stuck in Clerk without a database row, or in the database without a reachable listing."
      />
      <HousekeepingCard canScan={operators != null} />

      <div style={{ marginTop: 28, fontSize: 12, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 6 }}>
        <Shield size={13} /> Every change on this page is written to the platform audit trail.
      </div>

      {inviteOpen && (
        <InviteOperatorModal
          onClose={() => setInviteOpen(false)}
          onCreated={() => {
            setInviteOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ── operator row ──────────────────────────────────────────────────────────────

function OperatorRow({
  op,
  isOwner,
  isSelf,
  last,
  onChanged,
}: {
  op: PlatformOperator;
  isOwner: boolean;
  isSelf: boolean;
  last: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const roleFlash = useSaveFlash();
  const initials = `${op.first_name[0] ?? ""}${op.last_name[0] ?? ""}`;
  const pending = op.status === "pending";

  // Drop the optimistic value once the refreshed server data catches up.
  useEffect(() => {
    if (pendingRole !== null && pendingRole === op.role) setPendingRole(null);
  }, [pendingRole, op.role]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(role: string) {
    setPendingRole(role);
    roleFlash.start();
    setBusy(true);
    setError(null);
    try {
      await changePlatformOperatorRole(op.id, role);
      roleFlash.succeed();
      onChanged();
    } catch (err) {
      setPendingRole(null);
      roleFlash.fail();
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: GRID, padding: "14px 22px", alignItems: "center", borderBottom: last ? "none" : "0.5px solid var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <div style={{ width: 34, height: 34, borderRadius: 99, flexShrink: 0, background: pending ? "var(--paper-2)" : "var(--ink)", color: pending ? "var(--ink-3)" : "var(--paper)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600 }}>
          {initials}
        </div>
        <div style={{ lineHeight: 1.25, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {op.first_name} {op.last_name}
            {pending && (
              <span style={{ marginLeft: 8, fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "var(--sand-soft)", color: "#8C6B14", fontWeight: 500 }}>
                Pending
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--mono)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {op.email}
          </div>
        </div>
      </div>
      <div>
        {isOwner ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <select
              value={pendingRole ?? op.role}
              disabled={busy}
              onChange={(e) => changeRole(e.target.value)}
              style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 12 }}
            >
              <option value="owner">Owner</option>
              <option value="operator">Operator</option>
              <option value="support">Support</option>
            </select>
            <SaveFlash state={roleFlash.state} style={{ fontSize: 10.5 }} />
          </div>
        ) : (
          <span style={{ fontSize: 13, textTransform: "capitalize" }}>{op.role}</span>
        )}
      </div>
      <div>
        {op.mfa_enabled ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--moss)", fontWeight: 500 }}>
            <ShieldCheck size={13} /> On
          </span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--rose)", fontWeight: 500 }}>
            <ShieldOff size={13} /> Off
          </span>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{pending ? `Invited ${fmtDate(op.invited_at)}` : fmtDate(op.last_active_at)}</div>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
        {error ? <span style={{ fontSize: 10, color: "var(--rose)" }}>{error}</span> : null}
        {isOwner && pending && (
          <button type="button" disabled={busy} onClick={() => run(() => resendPlatformOperatorInvite(op.id))} style={rowBtn}>
            Resend
          </button>
        )}
        {isOwner && !isSelf && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Remove ${op.first_name} ${op.last_name} from tier 0?`)) {
                run(() => removePlatformOperator(op.id));
              }
            }}
            style={{ ...rowBtn, color: "var(--rose)", borderColor: "var(--rose-soft)" }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

// ── §2.2 tenant access controls ───────────────────────────────────────────────

const GRANT_STATUS_META: Record<string, { label: string; bg: string; c: string }> = {
  requested: { label: "Awaiting tenant", bg: "var(--sand-soft)", c: "#8C6B14" },
  active: { label: "Active", bg: "var(--moss-soft)", c: "var(--moss)" },
  expired: { label: "Expired", bg: "var(--paper-2)", c: "var(--ink-3)" },
  denied: { label: "Denied", bg: "var(--rose-soft)", c: "var(--rose)" },
};

function TenantAccessCard({
  settings,
  grants,
  isOwner,
  onSaved,
}: {
  settings: PlatformSettings;
  grants: TenantAccessGrantsResponse | null;
  isOwner: boolean;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<boolean | null>(null);
  const approvalFlash = useSaveFlash();
  const windowFlash = useSaveFlash();
  const recent = grants?.grants.slice(0, 5) ?? [];
  const approvalOn = pendingApproval ?? settings.access_requires_approval;

  // Drop the optimistic value once the refreshed server data catches up.
  useEffect(() => {
    if (pendingApproval !== null && pendingApproval === settings.access_requires_approval) setPendingApproval(null);
  }, [pendingApproval, settings.access_requires_approval]);

  async function save(partial: Partial<PlatformSettings>, flash: ReturnType<typeof useSaveFlash>): Promise<boolean> {
    setBusy(true);
    setError(null);
    flash.start();
    try {
      await updatePlatformSettings(partial);
      flash.succeed();
      onSaved();
      return true;
    } catch (err) {
      flash.fail();
      setError(err instanceof Error ? err.message : "Save failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function toggleApproval() {
    const next = !approvalOn;
    setPendingApproval(next);
    const ok = await save({ access_requires_approval: next }, approvalFlash);
    if (!ok) setPendingApproval(null);
  }

  return (
    <div style={{ ...card, padding: "22px 24px", marginBottom: 36 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: "14px 24px", alignItems: "start" }}>
        <SettingField label="Require tenant approval" flash={<SaveFlash state={approvalFlash.state} />}>
          <button
            type="button"
            disabled={!isOwner || busy}
            onClick={toggleApproval}
            style={{
              display: "inline-flex", alignItems: "center", gap: 10, padding: "9px 14px",
              borderRadius: 999, cursor: isOwner ? "pointer" : "not-allowed", fontFamily: "var(--ui)",
              fontSize: 13, border: "0.5px solid var(--line)",
              background: approvalOn ? "var(--moss-soft)" : "#fff",
              color: approvalOn ? "var(--moss)" : "var(--ink-2)",
              opacity: !isOwner || busy ? 0.6 : 1,
            }}
          >
            <span
              style={{
                width: 30, height: 17, borderRadius: 999, position: "relative", flexShrink: 0,
                background: approvalOn ? "var(--moss)" : "var(--line)",
                transition: "background .15s",
              }}
            >
              <span
                style={{
                  position: "absolute", top: 2, width: 13, height: 13, borderRadius: 99, background: "#fff",
                  left: approvalOn ? 15 : 2, transition: "left .15s",
                }}
              />
            </span>
            {approvalOn ? "On — tenant admin approves each request" : "Off — requests activate immediately"}
          </button>
        </SettingField>
        <SettingField label="Access window (hours)" flash={<SaveFlash state={windowFlash.state} />}>
          <input
            type="number"
            min={1}
            max={72}
            defaultValue={settings.access_window_hours}
            disabled={!isOwner || busy}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (v && v !== settings.access_window_hours) save({ access_window_hours: v }, windowFlash);
            }}
            style={inputStyle}
          />
        </SettingField>
        <SettingField label="Active grants">
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span
              style={{
                fontFamily: "var(--serif)", fontSize: 30, lineHeight: 1,
                color: (grants?.active_count ?? 0) > 0 ? "var(--terra)" : "var(--moss)",
              }}
            >
              {grants ? grants.active_count : "—"}
            </span>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
              {(grants?.active_count ?? 0) > 0 ? "operators inside a tenant" : "should usually be 0"}
            </span>
          </div>
        </SettingField>
      </div>

      {recent.length > 0 && (
        <div style={{ marginTop: 18, borderTop: "0.5px solid var(--line)", paddingTop: 14 }}>
          <div style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 500, marginBottom: 10 }}>
            Recent requests
          </div>
          {recent.map((g) => {
            const meta = GRANT_STATUS_META[g.status] ?? GRANT_STATUS_META.expired;
            return (
              <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", fontSize: 12.5 }}>
                <span style={{ fontWeight: 500 }}>{g.operator_name}</span>
                <span style={{ color: "var(--ink-3)" }}>→ {g.tenant_name}</span>
                <span style={{ color: "var(--ink-3)", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  “{g.reason}”
                </span>
                <span style={{ padding: "2px 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 500, background: meta.bg, color: meta.c, flexShrink: 0 }}>
                  {meta.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {error ? <p style={{ margin: "10px 0 0", color: "var(--rose)", fontSize: 12 }}>{error}</p> : null}
    </div>
  );
}

// ── §2.3 defaults form ────────────────────────────────────────────────────────

function DefaultsCard({
  settings,
  isOwner,
  onSaved,
}: {
  settings: PlatformSettings;
  isOwner: boolean;
  onSaved: () => void;
}) {
  const [language, setLanguage] = useState(settings.default_language);
  const [trial, setTrial] = useState(String(settings.trial_length_days));
  const [inviteExpiry, setInviteExpiry] = useState(String(settings.invite_expiry_days));
  const [retention, setRetention] = useState(String(settings.orphan_retention_days));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    language !== settings.default_language ||
    trial !== String(settings.trial_length_days) ||
    inviteExpiry !== String(settings.invite_expiry_days) ||
    retention !== String(settings.orphan_retention_days);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await updatePlatformSettings({
        default_language: language,
        trial_length_days: Number(trial),
        invite_expiry_days: Number(inviteExpiry),
        orphan_retention_days: Number(retention),
      });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...card, padding: "22px 24px", marginBottom: 36 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "14px 24px" }}>
        <SettingField label="Default language">
          <select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={!isOwner} style={inputStyle}>
            <option value="fr">Français</option>
            <option value="en">English</option>
            <option value="bilingual">Bilingue</option>
          </select>
        </SettingField>
        <SettingField label="Trial length (days)">
          <input type="number" min={0} max={365} value={trial} onChange={(e) => setTrial(e.target.value)} disabled={!isOwner} style={inputStyle} />
        </SettingField>
        <SettingField label="Invite expiry (days)">
          <input type="number" min={1} max={90} value={inviteExpiry} onChange={(e) => setInviteExpiry(e.target.value)} disabled={!isOwner} style={inputStyle} />
        </SettingField>
        <SettingField label="Orphan cleanup retention (days)">
          <input type="number" min={1} max={3650} value={retention} onChange={(e) => setRetention(e.target.value)} disabled={!isOwner} style={inputStyle} />
        </SettingField>
        <SettingField label="Data residency">
          <div style={{ ...inputStyle, display: "flex", alignItems: "center", gap: 8, background: "var(--paper-2)", color: "var(--ink-2)" }}>
            <Lock size={13} /> Canada · {settings.data_residency}
            <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--ink-3)" }}>Law 25 — locked</span>
          </div>
        </SettingField>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "flex-end", marginTop: 18 }}>
        {error ? <span style={{ fontSize: 12, color: "var(--rose)" }}>{error}</span> : null}
        {saved && !dirty ? (
          <span style={{ fontSize: 12, color: "var(--moss)", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Check size={13} /> Saved
          </span>
        ) : null}
        <button
          type="button"
          onClick={save}
          disabled={!isOwner || !dirty || busy}
          title={isOwner ? undefined : "Only an owner can edit defaults"}
          style={{ ...primaryBtn, opacity: !isOwner || !dirty || busy ? 0.45 : 1, cursor: !isOwner || !dirty ? "not-allowed" : "pointer" }}
        >
          {busy ? "Saving…" : "Save defaults"}
        </button>
      </div>
    </div>
  );
}

// ── §2.4 reserved slugs ───────────────────────────────────────────────────────

function ReservedSlugsCard({
  settings,
  isOwner,
  onSaved,
}: {
  settings: PlatformSettings;
  isOwner: boolean;
  onSaved: () => void;
}) {
  const [slugs, setSlugs] = useState<string[]>(settings.reserved_slugs);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flash = useSaveFlash();

  async function persist(next: string[]) {
    setBusy(true);
    setError(null);
    flash.start();
    try {
      const updated = await updatePlatformSettings({ reserved_slugs: next });
      setSlugs(updated.reserved_slugs);
      flash.succeed();
      onSaved();
    } catch (err) {
      flash.fail();
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function add() {
    const slug = draft.trim().toLowerCase();
    if (!slug || slugs.includes(slug)) {
      setDraft("");
      return;
    }
    setDraft("");
    void persist([...slugs, slug]);
  }

  return (
    <div style={{ ...card, padding: "22px 24px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {slugs.map((slug) => (
          <span key={slug} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 6px 5px 12px", borderRadius: 999, background: "var(--paper-2)", border: "0.5px solid var(--line)", fontFamily: "var(--mono)", fontSize: 12 }}>
            {slug}
            {isOwner && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void persist(slugs.filter((s) => s !== slug))}
                aria-label={`Remove ${slug}`}
                style={{ border: 0, background: "transparent", cursor: "pointer", color: "var(--ink-3)", display: "inline-flex", padding: 2 }}
              >
                <X size={12} />
              </button>
            )}
          </span>
        ))}
      </div>
      {isOwner && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, maxWidth: 480 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder="add a reserved slug…"
            style={inputStyle}
          />
          <button type="button" onClick={add} disabled={busy || !draft.trim()} style={{ ...primaryBtn, opacity: busy || !draft.trim() ? 0.45 : 1 }}>
            <Plus size={14} /> Add
          </button>
          <SaveFlash state={flash.state} />
        </div>
      )}
      {error ? <p style={{ margin: "10px 0 0", color: "var(--rose)", fontSize: 12 }}>{error}</p> : null}
    </div>
  );
}

// ── invite modal ──────────────────────────────────────────────────────────────

function InviteOperatorModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [role, setRole] = useState<"owner" | "operator" | "support">("operator");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!email.trim() || !first.trim() || !last.trim()) {
      setError("Name and email are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await invitePlatformOperator({
        email: email.trim(),
        role,
        first_name: first.trim(),
        last_name: last.trim(),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invite");
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(21,20,15,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }} onClick={onClose}>
      <div style={{ ...card, width: 440, maxWidth: "100%", padding: "28px 30px", background: "#fff", boxShadow: "0 30px 80px -20px rgba(0,0,0,.4)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div className="stf-h-eyebrow" style={eyebrow}>Tier 0</div>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: 28, lineHeight: 1.05, margin: "4px 0 0" }}>
              Add an <em style={{ fontStyle: "italic" }}>operator</em>
            </h2>
          </div>
          <button type="button" onClick={onClose} style={{ ...rowBtn, width: 32, height: 32, borderRadius: 99, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <X size={15} />
          </button>
        </div>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
          They&apos;ll get a sign-up link by email. Until they enable 2FA, sensitive actions stay blocked.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <ModalField label="First name">
            <input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="Josy" style={inputStyle} />
          </ModalField>
          <ModalField label="Last name">
            <input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Corneille" style={inputStyle} />
          </ModalField>
        </div>
        <ModalField label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ops@staffig.ca" style={inputStyle} />
        </ModalField>
        <ModalField label="Role">
          <div style={{ display: "flex", gap: 8 }}>
            {(["owner", "operator", "support"] as const).map((code) => {
              const active = role === code;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setRole(code)}
                  style={{
                    flex: 1,
                    padding: "9px 0",
                    borderRadius: 10,
                    cursor: "pointer",
                    fontFamily: "var(--ui)",
                    fontSize: 13,
                    textTransform: "capitalize",
                    background: active ? "var(--ink)" : "#fff",
                    color: active ? "var(--paper)" : "var(--ink)",
                    border: `0.5px solid ${active ? "transparent" : "var(--line)"}`,
                  }}
                >
                  {code}
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

// ── shared bits ───────────────────────────────────────────────────────────────

function SectionHead({ title, sub, action }: { title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, margin: "0 0 14px", flexWrap: "wrap" }}>
      <div>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: 0, letterSpacing: "-0.01em" }}>{title}</h2>
        <p style={{ margin: "5px 0 0", fontSize: 12.5, color: "var(--ink-3)", maxWidth: 560 }}>{sub}</p>
      </div>
      {action}
    </div>
  );
}

function SettingField({ label, flash, children }: { label: string; flash?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 7 }}>
        <span style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 500 }}>{label}</span>
        {flash}
      </div>
      {children}
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
  padding: "11px 18px",
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
  padding: "10px 13px",
  borderRadius: 10,
  border: "0.5px solid var(--line)",
  background: "var(--paper)",
  fontFamily: "var(--ui)",
  fontSize: 13.5,
  color: "var(--ink)",
  outline: "none",
  boxSizing: "border-box",
};
