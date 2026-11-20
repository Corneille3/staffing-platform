"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Check, Lock, Plus, Shield, ShieldCheck, ShieldOff, X } from "lucide-react";
import { HousekeepingCard } from "./housekeeping-card";
import { PlatformAuditCard } from "./platform-audit-card";
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

// Roles and their dot colour — names and blurbs come from
// `platform.settings.roles` / `roleBlurb`.
const ROLES = ["owner", "operator", "support", "marketing"] as const;
const ROLE_TONE: Record<(typeof ROLES)[number], string> = {
  owner: "var(--terra)",
  operator: "var(--moss)",
  support: "var(--ink-3)",
  marketing: "#8C6B14",
};

const GRID = "2.2fr 1fr 1fr 1fr 1.6fr";

function fmtDate(value: string | null, locale: string): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", { year: "numeric", month: "short", day: "numeric" });
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
  const tt = useTranslations("platform.settings");
  const [inviteOpen, setInviteOpen] = useState(false);
  const isOwner = operators?.viewer_role === "owner";

  return (
    <div style={{ padding: "32px 36px", maxWidth: 1100 }}>
      <div style={{ marginBottom: 26 }}>
        <div className="stf-h-eyebrow" style={eyebrow}>{tt("eyebrow")}</div>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: "clamp(2rem, 4vw, 2.75rem)", lineHeight: 1.02, margin: "6px 0 0", letterSpacing: "-0.02em" }}>
          {tt.rich("title", { em: (chunks) => <em style={{ fontStyle: "italic" }}>{chunks}</em> })}
        </h1>
        <p style={{ margin: "8px 0 0", color: "var(--ink-2)", fontSize: 14, maxWidth: 620 }}>
          {tt("description")}
        </p>
      </div>

      {/* ── §2.1 Operators & access ─────────────────────────────────────── */}
      <SectionHead
        title={tt("operators.title")}
        sub={tt("operators.sub")}
        action={
          operators ? (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              disabled={!isOwner}
              title={isOwner ? undefined : tt("operators.onlyOwnerAdd")}
              style={{ ...primaryBtn, opacity: isOwner ? 1 : 0.45, cursor: isOwner ? "pointer" : "not-allowed" }}
            >
              <Plus size={15} /> {tt("operators.add")}
            </button>
          ) : null
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14, marginBottom: 16 }}>
        {ROLES.map((role) => (
          <div key={role} style={{ ...card, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: ROLE_TONE[role] }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{tt(`roles.${role}`)}</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.45 }}>{tt(`roleBlurb.${role}`)}</div>
          </div>
        ))}
      </div>

      {operators ? (
        <div style={{ ...card, padding: 0, overflow: "hidden", marginBottom: 36 }}>
          <div style={{ display: "grid", gridTemplateColumns: GRID, padding: "12px 22px", borderBottom: "0.5px solid var(--line)", fontSize: 10, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 500 }}>
            <div>{tt("operators.colPerson")}</div><div>{tt("operators.colRole")}</div><div>{tt("operators.col2fa")}</div><div>{tt("operators.colLastActive")}</div><div />
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
          {tt("operators.hidden")}
        </div>
      )}

      {/* ── §2.2 Tenant access (the privacy exception) ──────────────────── */}
      <SectionHead
        title={tt("access.title")}
        sub={tt("access.sub")}
      />
      <TenantAccessCard
        settings={settings}
        grants={grants}
        isOwner={isOwner}
        onSaved={() => router.refresh()}
      />

      {/* ── §2.3 New-tenant defaults ────────────────────────────────────── */}
      <SectionHead
        title={tt("defaults.title")}
        sub={tt("defaults.sub")}
      />
      <DefaultsCard settings={settings} isOwner={isOwner} onSaved={() => router.refresh()} />

      {/* ── §2.4 Reserved slugs ─────────────────────────────────────────── */}
      <SectionHead
        title={tt("slugs.title")}
        sub={tt("slugs.sub")}
      />
      <ReservedSlugsCard settings={settings} isOwner={isOwner} onSaved={() => router.refresh()} />

      {/* ── Housekeeping ────────────────────────────────────────────────── */}
      <SectionHead
        title={tt("housekeeping.title")}
        sub={tt("housekeeping.sub")}
      />
      <HousekeepingCard canScan={operators != null} />

      {/* ── Audit trail — owner only (the API refuses anyone else) ────────── */}
      {isOwner ? <AuditSection /> : null}

      <div style={{ marginTop: 28, fontSize: 12, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 6 }}>
        <Shield size={13} /> {tt("auditNote")}
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

function AuditSection() {
  const ta = useTranslations("platform.audit");
  return (
    <div style={{ marginTop: 36 }}>
      <SectionHead title={ta("title")} sub={ta("sub")} />
      <PlatformAuditCard />
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
  const tt = useTranslations("platform.settings");
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const roleFlash = useSaveFlash();
  // Same reason as on the tenants table: a re-sent invite changes nothing
  // on the row, so the row has to say it happened.
  const resendFlash = useSaveFlash(4000);

  async function resend() {
    setBusy(true);
    setError(null);
    resendFlash.start();
    try {
      await resendPlatformOperatorInvite(op.id);
      resendFlash.succeed();
      onChanged();
    } catch (err) {
      resendFlash.fail();
      setError(err instanceof Error ? err.message : tt("actionFailed"));
    } finally {
      setBusy(false);
    }
  }
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
      setError(err instanceof Error ? err.message : tt("actionFailed"));
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
      setError(err instanceof Error ? err.message : tt("actionFailed"));
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
                {tt("operators.pending")}
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
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {tt(`roles.${role}`)}
                </option>
              ))}
            </select>
            <SaveFlash state={roleFlash.state} style={{ fontSize: 10.5 }} />
          </div>
        ) : (
          <span style={{ fontSize: 13 }}>{tt.has(`roles.${op.role}`) ? tt(`roles.${op.role}`) : op.role}</span>
        )}
      </div>
      <div>
        {op.mfa_enabled ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--moss)", fontWeight: 500 }}>
            <ShieldCheck size={13} /> {tt("operators.mfaOn")}
          </span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--rose)", fontWeight: 500 }}>
            <ShieldOff size={13} /> {tt("operators.mfaOff")}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{pending ? tt("operators.invited", { date: fmtDate(op.invited_at, locale) }) : fmtDate(op.last_active_at, locale)}</div>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
        {error ? <span style={{ fontSize: 10, color: "var(--rose)" }}>{error}</span> : null}
        <span role="status">
          <SaveFlash state={resendFlash.state} savingLabel={tt("operators.resending")} savedLabel={tt("operators.resent")} style={{ fontSize: 11 }} />
        </span>
        {isOwner && pending && (
          <button type="button" disabled={busy} onClick={resend} style={rowBtn}>
            {tt("operators.resend")}
          </button>
        )}
        {isOwner && !isSelf && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm(tt("operators.confirmRemove", { name: `${op.first_name} ${op.last_name}` }))) {
                run(() => removePlatformOperator(op.id));
              }
            }}
            style={{ ...rowBtn, color: "var(--rose)", borderColor: "var(--rose-soft)" }}
          >
            {tt("operators.remove")}
          </button>
        )}
      </div>
    </div>
  );
}

// ── §2.2 tenant access controls ───────────────────────────────────────────────

// Colours only — the wording comes from `platform.settings.access.status`.
const GRANT_STATUS_META: Record<string, { bg: string; c: string }> = {
  requested: { bg: "var(--sand-soft)", c: "#8C6B14" },
  active: { bg: "var(--moss-soft)", c: "var(--moss)" },
  expired: { bg: "var(--paper-2)", c: "var(--ink-3)" },
  denied: { bg: "var(--rose-soft)", c: "var(--rose)" },
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
  const tt = useTranslations("platform.settings");
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
      setError(err instanceof Error ? err.message : tt("saveFailed"));
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
        <SettingField label={tt("access.requireApproval")} flash={<SaveFlash state={approvalFlash.state} />}>
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
            {approvalOn ? tt("access.approvalOn") : tt("access.approvalOff")}
          </button>
        </SettingField>
        <SettingField label={tt("access.window")} flash={<SaveFlash state={windowFlash.state} />}>
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
        <SettingField label={tt("access.activeGrants")}>
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
              {(grants?.active_count ?? 0) > 0 ? tt("access.inside") : tt("access.usuallyZero")}
            </span>
          </div>
        </SettingField>
      </div>

      {recent.length > 0 && (
        <div style={{ marginTop: 18, borderTop: "0.5px solid var(--line)", paddingTop: 14 }}>
          <div style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 500, marginBottom: 10 }}>
            {tt("access.recent")}
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
                  {tt.has(`access.status.${g.status}`) ? tt(`access.status.${g.status}`) : g.status}
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
  const tt = useTranslations("platform.settings");
  const tc = useTranslations("common");
  const tLang = useTranslations("admin.languageNames");
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
      setError(err instanceof Error ? err.message : tt("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...card, padding: "22px 24px", marginBottom: 36 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "14px 24px" }}>
        <SettingField label={tt("defaults.language")}>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={!isOwner} style={inputStyle}>
            <option value="fr">{tLang("fr")}</option>
            <option value="en">{tLang("en")}</option>
            <option value="bilingual">{tLang("bilingual")}</option>
          </select>
        </SettingField>
        <SettingField label={tt("defaults.trial")}>
          <input type="number" min={0} max={365} value={trial} onChange={(e) => setTrial(e.target.value)} disabled={!isOwner} style={inputStyle} />
        </SettingField>
        <SettingField label={tt("defaults.inviteExpiry")}>
          <input type="number" min={1} max={90} value={inviteExpiry} onChange={(e) => setInviteExpiry(e.target.value)} disabled={!isOwner} style={inputStyle} />
        </SettingField>
        <SettingField label={tt("defaults.retention")}>
          <input type="number" min={1} max={3650} value={retention} onChange={(e) => setRetention(e.target.value)} disabled={!isOwner} style={inputStyle} />
        </SettingField>
        <SettingField label={tt("defaults.residency")}>
          <div style={{ ...inputStyle, display: "flex", alignItems: "center", gap: 8, background: "var(--paper-2)", color: "var(--ink-2)" }}>
            <Lock size={13} /> Canada · {settings.data_residency}
            <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--ink-3)" }}>{tt("defaults.locked")}</span>
          </div>
        </SettingField>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "flex-end", marginTop: 18 }}>
        {error ? <span style={{ fontSize: 12, color: "var(--rose)" }}>{error}</span> : null}
        {saved && !dirty ? (
          <span style={{ fontSize: 12, color: "var(--moss)", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Check size={13} /> {tc("saved")}
          </span>
        ) : null}
        <button
          type="button"
          onClick={save}
          disabled={!isOwner || !dirty || busy}
          title={isOwner ? undefined : tt("defaults.onlyOwnerEdit")}
          style={{ ...primaryBtn, opacity: !isOwner || !dirty || busy ? 0.45 : 1, cursor: !isOwner || !dirty ? "not-allowed" : "pointer" }}
        >
          {busy ? tt("defaults.saving") : tt("defaults.save")}
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
  const tt = useTranslations("platform.settings");
  const tc = useTranslations("common");
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
      setError(err instanceof Error ? err.message : tt("saveFailed"));
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
                aria-label={tt("slugs.removeAria", { slug })}
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
            placeholder={tt("slugs.placeholder")}
            style={inputStyle}
          />
          <button type="button" onClick={add} disabled={busy || !draft.trim()} style={{ ...primaryBtn, opacity: busy || !draft.trim() ? 0.45 : 1 }}>
            <Plus size={14} /> {tc("add")}
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
  const tt = useTranslations("platform.settings");
  const tc = useTranslations("common");
  const [email, setEmail] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [role, setRole] = useState<"owner" | "operator" | "support" | "marketing">("operator");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!email.trim() || !first.trim() || !last.trim()) {
      setError(tt("invite.required"));
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
      setError(err instanceof Error ? err.message : tt("invite.failed"));
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(21,20,15,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }} onClick={onClose}>
      <div style={{ ...card, width: 440, maxWidth: "100%", padding: "28px 30px", background: "#fff", boxShadow: "0 30px 80px -20px rgba(0,0,0,.4)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div className="stf-h-eyebrow" style={eyebrow}>{tt("invite.eyebrow")}</div>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: 28, lineHeight: 1.05, margin: "4px 0 0" }}>
              {tt.rich("invite.title", { em: (chunks) => <em style={{ fontStyle: "italic" }}>{chunks}</em> })}
            </h2>
          </div>
          <button type="button" onClick={onClose} style={{ ...rowBtn, width: 32, height: 32, borderRadius: 99, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <X size={15} />
          </button>
        </div>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
          {tt("invite.body")}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <ModalField label={tt("invite.firstName")}>
            <input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="Josy" style={inputStyle} />
          </ModalField>
          <ModalField label={tt("invite.lastName")}>
            <input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Corneille" style={inputStyle} />
          </ModalField>
        </div>
        <ModalField label={tt("invite.email")}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ops@staffig.ca" style={inputStyle} />
        </ModalField>
        <ModalField label={tt("invite.role")}>
          <div style={{ display: "flex", gap: 8 }}>
            {ROLES.map((code) => {
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
                    background: active ? "var(--ink)" : "#fff",
                    color: active ? "var(--paper)" : "var(--ink)",
                    border: `0.5px solid ${active ? "transparent" : "var(--line)"}`,
                  }}
                >
                  {tt(`roles.${code}`)}
                </button>
              );
            })}
          </div>
        </ModalField>

        {error ? <p style={{ margin: "4px 0 0", color: "var(--rose)", fontSize: 12 }}>{error}</p> : null}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
          <button type="button" onClick={onClose} style={rowBtn}>{tc("cancel")}</button>
          <button type="button" onClick={submit} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
            <ArrowRight size={14} /> {busy ? tt("invite.sending") : tt("invite.send")}
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
