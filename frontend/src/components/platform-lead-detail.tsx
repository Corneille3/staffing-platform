"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, ArrowUpRight, Check, ExternalLink, Info, Send, Trash2 } from "lucide-react";
import { Link, useRouter } from "../i18n/navigation";
import { addLeadEvent, deleteLead, fetchLead, inviteLead, updateLead, winLead } from "../lib/browser-api";
import {
  LEAD_BAN_PHASES,
  LEAD_EVENT_TYPES,
  LEAD_KINDS,
  LEAD_SEGMENTS,
  LEAD_SOURCES,
  LEAD_STATUSES,
  LEAD_WAVES,
  canDeleteLead,
  canInviteLead,
  canMoveLead,
  daysBetween,
  formatDay,
  isLeadOverdue,
  leadTenantBanner,
  slugifyOrgName,
  splitContactName,
} from "../lib/leads";
import { shiftDateKey, shiftDateTime } from "../lib/shift-time";
import type { Lead, LeadDetail, LeadEvent, LeadInviteResult, LeadPatch, LeadStatus, LeadTenantSummary } from "../lib/types";
import {
  LEAD_STATUS_TONE,
  LeadFieldLabel,
  LeadKindBadge,
  LeadModal,
  LeadStatusChip,
  leadCard,
  leadEyebrow,
  leadGhostBtn,
  leadInput,
  leadPrimaryBtn,
  leadRowBtn,
  useLeadError,
} from "./platform-leads-shared";
import { SaveFlash, useSaveFlash } from "./ui";

type Option = readonly [value: string, label: string];
type FieldKey = keyof LeadPatch;

export function PlatformLeadDetail({
  initial,
  todayKey,
  isOwner,
}: {
  initial: LeadDetail;
  todayKey: string;
  // Only an owner can invite the lead as a network, open the tenants
  // console and delete the lead; marketing runs the pipeline up to the
  // hand-over.
  isOwner: boolean;
}) {
  const t = useTranslations("platform.leads");
  const locale = useLocale();
  const [lead, setLead] = useState<Lead>(initial);
  const [events, setEvents] = useState<LeadEvent[]>(initial.events);
  const [tenant, setTenant] = useState<LeadTenantSummary | null>(initial.tenant);
  const [inviting, setInviting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function reloadFeed() {
    try {
      const fresh = await fetchLead(lead.id);
      setEvents(fresh.events);
      setTenant(fresh.tenant);
    } catch {
      // The write itself went through; a stale feed is not worth an error.
    }
  }

  function onInvited(result: LeadInviteResult) {
    setLead(result.lead);
    setTenant(result.tenant);
    setInviting(false);
    void reloadFeed();
  }

  /** One PATCH; the row state follows the server's answer. Throws on refusal
   * so the calling field can show the message and roll its draft back. */
  async function patch(change: LeadPatch): Promise<void> {
    // « Won » has its own route: the server only accepts it from `pilot`.
    const updated = change.status === "won" ? await winLead(lead.id) : await updateLead(lead.id, change);
    setLead(updated);
    // A transition wrote an event — pull the feed rather than guess it.
    if (change.status) await reloadFeed();
  }

  const overdue = isLeadOverdue(lead, todayKey);
  const field = (key: string) => t(`field.${key}`);
  const text = (key: FieldKey, extra: Partial<FieldProps> = {}) => (
    <Field key={key} label={field(key)} value={lead[key] as string | number | null} onSave={(v) => patch({ [key]: v })} {...extra} />
  );
  const select = (key: FieldKey, options: Option[], extra: Partial<FieldProps> = {}) => (
    <Field key={key} label={field(key)} value={lead[key] as string | null} options={options} onSave={(v) => patch({ [key]: v })} {...extra} />
  );

  return (
    <div style={{ padding: "28px 36px 64px", maxWidth: 1280 }}>
      <Link href="/platform/leads" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ink-2)", fontSize: 13, textDecoration: "none", marginBottom: 16 }}>
        <ArrowLeft size={14} /> {t("detail.back")}
      </Link>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...leadEyebrow, display: "flex", alignItems: "center", gap: 8 }}>
            {t(`segment.${lead.segment}`)}
            {lead.external_ref ? <span style={{ fontFamily: "var(--mono)", letterSpacing: 0 }}>· {lead.external_ref}</span> : null}
          </div>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: "clamp(1.9rem, 3.6vw, 2.6rem)", lineHeight: 1.05, margin: "6px 0 8px", letterSpacing: "-0.02em", fontWeight: 400 }}>
            {lead.org_name}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12, color: "var(--ink-3)" }}>
            <LeadStatusChip status={lead.status} />
            <LeadKindBadge kind={lead.kind} />
            <span>{[lead.city, lead.province].filter(Boolean).join(", ")}</span>
            <span>· {t("detail.created", { date: formatDay(shiftDateKey(lead.created_at), locale) })}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* Hidden while the lead's workspace exists — the API refuses it too. */}
          {isOwner && canDeleteLead(lead, tenant?.status ?? null) ? (
            <button type="button" onClick={() => setDeleting(true)} style={{ ...leadGhostBtn, color: "var(--rose)", borderColor: "var(--rose)" }}>
              <Trash2 size={14} /> {t("detail.delete")}
            </button>
          ) : null}
          {isOwner && canInviteLead(lead) ? (
            <button type="button" onClick={() => setInviting(true)} style={leadPrimaryBtn}>
              <Send size={14} /> {t("detail.invite")}
            </button>
          ) : null}
        </div>
      </div>

      {inviting ? <InviteModal lead={lead} onClose={() => setInviting(false)} onInvited={onInvited} /> : null}
      {deleting ? <DeleteModal lead={lead} onClose={() => setDeleting(false)} /> : null}

      <StatusBar lead={lead} isOwner={isOwner} tenantStatus={tenant?.status ?? null} onMove={(status, reason) => patch(reason ? { status, lost_reason: reason } : { status })} />

      {lead.tenant_id ? <TenantBanner lead={lead} tenant={tenant} isOwner={isOwner} /> : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(300px, 1fr)", gap: 18, alignItems: "start" }}>
        {/* Left — every field edits in place and saves on blur */}
        <div style={{ display: "grid", gap: 18, minWidth: 0 }}>
          <Section title={t("detail.secTracking")} accent={overdue}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(150px, 1fr)", gap: 14 }}>
              {text("next_action")}
              <Field
                label={overdue ? `${field("next_action_at")} · ${t("list.overdue")}` : field("next_action_at")}
                value={lead.next_action_at}
                type="date"
                danger={overdue}
                onSave={(v) => patch({ next_action_at: v as string | null })}
              />
            </div>
            {text("notes", { multiline: true })}
          </Section>

          <Section title={t("detail.secOrganization")}>
            <Grid>
              {text("org_name", { required: true })}
              {select("segment", LEAD_SEGMENTS.map((s) => [s, t(`segment.${s}`)]), { required: true })}
              {text("subtype")}
              {select("kind", LEAD_KINDS.map((k) => [k, t(`kind.${k}`)]), { required: true })}
              {text("site_count", { type: "number", min: 0 })}
              {text("capacity_note")}
              {text("city")}
              {text("province", { required: true, upper: true, maxLength: 2 })}
            </Grid>
            {text("regions")}
          </Section>

          <Section title={t("detail.secContact")}>
            <Grid>
              {text("contact_name")}
              {text("contact_title")}
              {text("email", { type: "email" })}
              {text("phone", { type: "tel" })}
              {text("website", { link: true })}
              {select("language", [["fr", t("language.fr")], ["en", t("language.en")]], { required: true })}
            </Grid>
          </Section>

          <Section title={t("detail.secQualification")}>
            <Grid>
              {text("score", { type: "number", min: 0, max: 10 })}
              {select("wave", LEAD_WAVES.map((w) => [w, t("list.wave", { wave: w })]))}
              {select("agency_ban_phase", LEAD_BAN_PHASES.map((p) => [p, t(`phaseLong.${p}`)]), { required: true })}
              <Field
                label={field("hiring_signal")}
                value={lead.hiring_signal === null ? null : lead.hiring_signal ? "yes" : "no"}
                options={[["yes", t("hiring.yes")], ["no", t("hiring.no")]]}
                emptyLabel={t("hiring.unknown")}
                onSave={(v) => patch({ hiring_signal: v === null ? null : v === "yes" })}
              />
            </Grid>
          </Section>

          <Section title={t("detail.secOrigin")}>
            <Grid>
              {select("source", LEAD_SOURCES.map((s) => [s, t(`source.${s}`)]), { required: true })}
              {text("source_detail")}
              {text("external_ref")}
              {text("source_url", { link: true })}
            </Grid>
          </Section>
        </div>

        {/* Right — the activity feed */}
        <ActivityFeed leadId={lead.id} events={events} onAdded={(event) => setEvents((prev) => [event, ...prev])} />
      </div>
    </div>
  );
}

// ── Linked tenant ────────────────────────────────────────────────────────────

const BANNER_TONE = {
  moss: { bg: "var(--moss-soft)", c: "var(--moss)" },
  sand: { bg: "var(--sand-soft)", c: "#8C6B14" },
  muted: { bg: "var(--paper-2)", c: "var(--ink-3)" },
} as const;

function TenantBanner({ lead, tenant, isOwner }: { lead: Lead; tenant: LeadTenantSummary | null; isOwner: boolean }) {
  const t = useTranslations("platform.leads");
  const locale = useLocale();
  const kind = leadTenantBanner(lead, tenant?.status ?? null);
  const tone = BANNER_TONE[kind === "removed" ? "muted" : kind === "lost_live" ? "sand" : "moss"];
  const name = tenant?.name ?? lead.org_name;
  const title = {
    won: "detail.convertedTitle",
    removed: "detail.removedTitle",
    lost_live: "detail.lostLiveTitle",
    pilot: "detail.pilotTitle",
    invited: "detail.invitedTitle",
  }[kind];
  const body =
    kind === "won" && lead.won_at
      ? t("detail.convertedBody", {
          date: formatDay(shiftDateKey(lead.won_at), locale),
          days: daysBetween(lead.created_at, lead.won_at),
        })
      : t({ won: "detail.pilotBody", removed: "detail.removedBody", lost_live: "detail.lostLiveBody", pilot: "detail.pilotBody", invited: "detail.invitedBody" }[kind], { name });
  // The tenant's own state adds nothing once the title already says it.
  const showState = tenant && (kind === "invited" || kind === "pilot" || kind === "lost_live");

  return (
    <div style={{ ...leadCard, padding: "16px 20px", marginBottom: 18, background: tone.bg, borderColor: "transparent", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      {tone === BANNER_TONE.moss ? (
        <Check size={18} style={{ color: tone.c, flexShrink: 0 }} />
      ) : (
        <Info size={18} style={{ color: tone.c, flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: tone.c }}>
          {t(title)}
          {showState ? (
            <span style={{ fontWeight: 400, color: "var(--ink-2)" }}>
              {" · "}
              {t.has(`detail.tenantStatus.${tenant.status}`) ? t(`detail.tenantStatus.${tenant.status}`) : tenant.status}
            </span>
          ) : null}
        </div>
        <div style={{ fontSize: 13, color: "var(--ink)", marginTop: 2 }}>{body}</div>
        {tenant ? (
          <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3, fontFamily: "var(--mono)" }}>{tenant.slug}</div>
        ) : null}
      </div>
      {/* A removed tenant is no longer listed on the tenants page. */}
      {isOwner && kind !== "removed" ? (
        <Link href={tenant ? `/platform/tenants?tenant=${tenant.id}` : "/platform/tenants"} style={{ ...leadRowBtn, textDecoration: "none", background: "#fff" }}>
          {t("detail.viewTenants")} <ArrowUpRight size={13} />
        </Link>
      ) : null}
    </div>
  );
}

// ── Stage bar ────────────────────────────────────────────────────────────────

function StatusBar({
  lead,
  isOwner,
  tenantStatus,
  onMove,
}: {
  lead: Lead;
  // « Won » is the owner's, from `pilot`; `invited` / `pilot` follow the
  // linked workspace (see canMoveLead).
  isOwner: boolean;
  tenantStatus: string | null;
  onMove: (status: LeadStatus, lostReason?: string) => Promise<void>;
}) {
  const leadError = useLeadError();
  const t = useTranslations("platform.leads");
  const [busy, setBusy] = useState<LeadStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [losing, setLosing] = useState(false);
  const [winning, setWinning] = useState(false);
  const [reason, setReason] = useState("");

  async function move(status: LeadStatus, lostReason?: string) {
    setBusy(status);
    setError(null);
    try {
      await onMove(status, lostReason);
      setLosing(false);
      setWinning(false);
      setReason("");
    } catch (err) {
      setError(leadError(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ ...leadCard, padding: "16px 18px", marginBottom: 18 }}>
      <div style={{ ...leadEyebrow, marginBottom: 10 }}>{t("detail.statusTitle")}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {LEAD_STATUSES.map((status) => {
          const current = lead.status === status;
          const allowed = canMoveLead(lead.status, status, { isOwner, tenantStatus });
          const systemStage = status === "invited" || status === "pilot";
          const tone = LEAD_STATUS_TONE[status];
          return (
            <button
              key={status}
              type="button"
              disabled={!allowed || busy !== null}
              aria-pressed={current}
              title={
                current || allowed
                  ? undefined
                  : status === "won"
                    ? t("detail.wonHint")
                    : systemStage
                      ? t("detail.systemStageHint")
                      : undefined
              }
              onClick={() => {
                setLosing(status === "lost");
                setWinning(status === "won");
                if (status !== "lost" && status !== "won") void move(status);
              }}
              style={{
                flex: "1 1 110px",
                padding: "10px 8px",
                borderRadius: 10,
                fontFamily: "var(--ui)",
                fontSize: 12.5,
                fontWeight: current ? 600 : 400,
                cursor: allowed && busy === null ? "pointer" : "default",
                background: current ? tone.bg : "#fff",
                color: current ? tone.c : allowed ? "var(--ink)" : "var(--ink-4)",
                border: `0.5px solid ${current ? tone.c : "var(--line)"}`,
                opacity: busy === status ? 0.6 : 1,
                minHeight: 40,
              }}
            >
              {t(`status.${status}`)}
            </button>
          );
        })}
      </div>

      {losing ? (
        <div style={{ marginTop: 14, padding: "14px 16px", borderRadius: 10, background: "var(--rose-soft)" }}>
          <LeadFieldLabel>{t("detail.lostReasonLabel")}</LeadFieldLabel>
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && reason.trim()) void move("lost", reason.trim());
              if (e.key === "Escape") setLosing(false);
            }}
            placeholder={t("detail.lostReasonPlaceholder")}
            maxLength={1000}
            style={{ ...leadInput, background: "#fff" }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
            <button type="button" onClick={() => setLosing(false)} style={{ ...leadRowBtn, background: "#fff" }}>{t("detail.cancel")}</button>
            <button
              type="button"
              disabled={!reason.trim() || busy !== null}
              onClick={() => move("lost", reason.trim())}
              style={{ ...leadPrimaryBtn, padding: "8px 14px", fontSize: 12, background: "var(--rose)", opacity: !reason.trim() || busy !== null ? 0.5 : 1 }}
            >
              {t("detail.confirmLost")}
            </button>
          </div>
        </div>
      ) : null}

      {winning ? (
        <div style={{ marginTop: 14, padding: "14px 16px", borderRadius: 10, background: "var(--moss-soft)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <p style={{ margin: 0, flex: 1, minWidth: 220, fontSize: 13, lineHeight: 1.5 }}>{t("detail.winConfirm")}</p>
          <button type="button" onClick={() => setWinning(false)} style={{ ...leadRowBtn, background: "#fff" }}>{t("detail.cancel")}</button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => move("won")}
            style={{ ...leadPrimaryBtn, padding: "8px 14px", fontSize: 12, background: "var(--moss)", opacity: busy !== null ? 0.5 : 1 }}
          >
            {t("detail.confirmWon")}
          </button>
        </div>
      ) : null}

      {lead.status === "lost" ? (
        <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "var(--rose)" }}>
          {t("detail.lostBecause", { reason: lead.lost_reason ?? "—" })}
          <span style={{ color: "var(--ink-3)" }}> · {t("detail.reopenHint")}</span>
        </p>
      ) : null}
      {lead.status === "won" ? (
        <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "var(--moss)" }}>{t("detail.closedWon")}</p>
      ) : null}
      {error ? <p role="alert" style={{ margin: "10px 0 0", color: "var(--rose)", fontSize: 12 }}>{error}</p> : null}
    </div>
  );
}

// ── Editable field ───────────────────────────────────────────────────────────

type FieldProps = {
  label: string;
  value: string | number | null;
  onSave: (value: string | number | null) => Promise<void>;
  type?: "text" | "number" | "date" | "email" | "tel";
  options?: Option[];
  emptyLabel?: string;
  multiline?: boolean;
  required?: boolean;
  upper?: boolean;
  link?: boolean;
  danger?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
};

/** One column of the lead, edited in place: a select saves on change, any
 * other input on blur (Enter blurs a single-line input). On refusal the draft
 * snaps back to the stored value and the server's message shows underneath. */
function Field({
  label, value, onSave, type = "text", options, emptyLabel, multiline, required, upper, link, danger, min, max, maxLength,
}: FieldProps) {
  const leadError = useLeadError();
  const tCommon = useTranslations("common");
  const stored = value === null || value === undefined ? "" : String(value);
  const [draft, setDraft] = useState(stored);
  const [lastStored, setLastStored] = useState(stored);
  const [error, setError] = useState<string | null>(null);
  const flash = useSaveFlash();

  // The stored value moved under us (a save elsewhere, e.g. the import's
  // normalisation or a reopened lead clearing its reason): follow it.
  if (stored !== lastStored) {
    setLastStored(stored);
    setDraft(stored);
  }

  async function commit(raw: string) {
    const next = upper ? raw.trim().toUpperCase() : raw.trim();
    if (next === stored) {
      setDraft(stored);
      return;
    }
    if (required && !next) {
      setDraft(stored);
      return;
    }
    let payload: string | number | null = next || null;
    if (type === "number" && next) {
      const parsed = Number(next);
      if (!Number.isInteger(parsed)) {
        setDraft(stored);
        return;
      }
      payload = parsed;
    }
    setError(null);
    flash.start();
    try {
      await onSave(payload);
      flash.succeed();
    } catch (err) {
      flash.fail();
      setDraft(stored);
      setError(leadError(err));
    }
  }

  const style = {
    ...leadInput,
    background: "#fff",
    fontSize: 13.5,
    ...(danger ? { borderColor: "var(--rose)", color: "var(--rose)" } : {}),
  };
  const href = link && stored ? (/^https?:\/\//i.test(stored) ? stored : `https://${stored}`) : null;

  return (
    <label style={{ display: "block", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <LeadFieldLabel>{label}</LeadFieldLabel>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <SaveFlash state={flash.state} savingLabel={tCommon("saving")} savedLabel={tCommon("saved")} style={{ fontSize: 10.5 }} />
          {href ? (
            <a href={href} target="_blank" rel="noreferrer noopener" aria-label={label} style={{ color: "var(--ink-3)", display: "inline-flex" }} onClick={(e) => e.stopPropagation()}>
              <ExternalLink size={12} />
            </a>
          ) : null}
        </span>
      </div>
      {options ? (
        <select
          value={draft}
          onChange={(e) => { setDraft(e.target.value); void commit(e.target.value); }}
          style={style}
        >
          {required && draft ? null : <option value="">{emptyLabel ?? "—"}</option>}
          {options.map(([code, text]) => <option key={code} value={code}>{text}</option>)}
        </select>
      ) : multiline ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => void commit(e.target.value)}
          rows={4}
          maxLength={10000}
          style={{ ...style, resize: "vertical", lineHeight: 1.5, marginTop: 0 }}
        />
      ) : (
        <input
          type={type}
          value={draft}
          min={min}
          max={max}
          maxLength={maxLength}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => void commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setDraft(stored);
          }}
          style={type === "number" || type === "date" ? { ...style, fontFamily: "var(--mono)" } : style}
        />
      )}
      {error ? <span role="alert" style={{ display: "block", marginTop: 4, fontSize: 11, color: "var(--rose)", fontWeight: 600 }}>{error}</span> : null}
    </label>
  );
}

function Section({ title, accent, children }: { title: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <section style={{ ...leadCard, padding: "18px 20px", borderColor: accent ? "var(--rose)" : "var(--line)" }}>
      <div style={{ ...leadEyebrow, marginBottom: 14 }}>{title}</div>
      <div style={{ display: "grid", gap: 14 }}>{children}</div>
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>{children}</div>;
}

// ── Activity feed ────────────────────────────────────────────────────────────

function ActivityFeed({
  leadId,
  events,
  onAdded,
}: {
  leadId: string;
  events: LeadEvent[];
  onAdded: (event: LeadEvent) => void;
}) {
  const leadError = useLeadError();
  const t = useTranslations("platform.leads");
  const [type, setType] = useState<(typeof LEAD_EVENT_TYPES)[number]>("note");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      onAdded(await addLeadEvent(leadId, type, body.trim()));
      setBody("");
    } catch (err) {
      setError(leadError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ ...leadCard, padding: "18px 20px", position: "sticky", top: 70 }}>
      <div style={{ ...leadEyebrow, marginBottom: 14 }}>{t("detail.activityTitle")}</div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {LEAD_EVENT_TYPES.map((code) => {
          const active = type === code;
          return (
            <button
              key={code}
              type="button"
              aria-pressed={active}
              onClick={() => setType(code)}
              style={{
                padding: "6px 11px",
                borderRadius: 999,
                fontFamily: "var(--ui)",
                fontSize: 12,
                cursor: "pointer",
                background: active ? "var(--ink)" : "#fff",
                color: active ? "var(--paper)" : "var(--ink)",
                border: `0.5px solid ${active ? "transparent" : "var(--line)"}`,
              }}
            >
              {t(`event.${code}`)}
            </button>
          );
        })}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void add();
        }}
        placeholder={t("detail.addPlaceholder")}
        aria-label={t("detail.addPlaceholder")}
        rows={3}
        maxLength={5000}
        style={{ ...leadInput, background: "#fff", fontSize: 13.5, resize: "vertical", lineHeight: 1.5 }}
      />
      {error ? <p role="alert" style={{ margin: "6px 0 0", color: "var(--rose)", fontSize: 12 }}>{error}</p> : null}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <button type="button" onClick={add} disabled={busy || !body.trim()} style={{ ...leadPrimaryBtn, padding: "8px 14px", fontSize: 12, opacity: busy || !body.trim() ? 0.5 : 1 }}>
          {busy ? t("detail.adding") : t("detail.add")}
        </button>
      </div>

      <div style={{ marginTop: 16, borderTop: "0.5px solid var(--line)", maxHeight: 520, overflowY: "auto" }}>
        {events.length === 0 ? (
          <p style={{ margin: "14px 0 0", fontSize: 13, color: "var(--ink-3)" }}>{t("detail.activityEmpty")}</p>
        ) : (
          events.map((event) => (
            <div key={event.id} style={{ padding: "12px 0", borderBottom: "0.5px solid var(--line)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                  {t.has(`event.${event.type}`) ? t(`event.${event.type}`) : event.type}
                </span>
                <span style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--mono)", whiteSpace: "nowrap" }}>
                  {shiftDateTime(event.created_at)}
                </span>
              </div>
              {event.from_status && event.to_status && event.from_status !== event.to_status ? (
                <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 3 }}>
                  {t("detail.transition", { from: t(`status.${event.from_status}`), to: t(`status.${event.to_status}`) })}
                </div>
              ) : null}
              {event.body ? (
                <div style={{ fontSize: 13, color: "var(--ink)", marginTop: 4, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                  {event.body}
                </div>
              ) : null}
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>{event.actor_name ?? t("detail.system")}</div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

// ── « Invite as a network » ──────────────────────────────────────────────────

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

/** Owner only. Pre-filled from the lead; the operator supplies what a tenant
 * needs on top — an address and a named admin. */
/** Owner only. Deleting is final: the lead and its feed go, and the list is
 * the only place left to land on. */
function DeleteModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const leadError = useLeadError();
  const t = useTranslations("platform.leads");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await deleteLead(lead.id);
      router.push("/platform/leads");
      router.refresh();
    } catch (err) {
      setError(leadError(err));
      setBusy(false);
    }
  }

  return (
    <LeadModal eyebrow={t("deleteModal.eyebrow")} title={t("deleteModal.title")} titleEm={t("deleteModal.titleEm")} width={460} onClose={busy ? () => {} : onClose}>
      <p style={{ margin: "0 0 18px", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
        {t.rich("deleteModal.body", { name: lead.org_name, b: (chunks) => <strong>{chunks}</strong> })}
      </p>
      {error ? <p role="alert" style={{ margin: "0 0 12px", color: "var(--rose)", fontSize: 12.5 }}>{error}</p> : null}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} disabled={busy} style={leadGhostBtn}>{t("detail.cancel")}</button>
        <button type="button" onClick={confirm} disabled={busy} style={{ ...leadPrimaryBtn, background: "var(--rose)", opacity: busy ? 0.6 : 1 }}>
          <Trash2 size={14} /> {busy ? t("deleteModal.deleting") : t("deleteModal.confirm")}
        </button>
      </div>
    </LeadModal>
  );
}

function InviteModal({
  lead,
  onClose,
  onInvited,
}: {
  lead: Lead;
  onClose: () => void;
  onInvited: (result: LeadInviteResult) => void;
}) {
  const leadError = useLeadError();
  const t = useTranslations("platform.leads");
  const contact = splitContactName(lead.contact_name);
  const [name, setName] = useState(lead.org_name);
  const [slug, setSlug] = useState(slugifyOrgName(lead.org_name));
  const [first, setFirst] = useState(contact.first);
  const [last, setLast] = useState(contact.last);
  const [email, setEmail] = useState(lead.email ?? "");
  const [phone, setPhone] = useState(lead.phone ?? "");
  const [region, setRegion] = useState("");
  const [language, setLanguage] = useState<"fr" | "en">(lead.language === "en" ? "en" : "fr");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const cleanSlug = slug.trim().toLowerCase();
    if (!name.trim() || !cleanSlug || !first.trim() || !last.trim() || !email.trim()) {
      setError(t("inviteModal.required"));
      return;
    }
    if (!SLUG_PATTERN.test(cleanSlug)) {
      setError(t("inviteModal.slugInvalid"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onInvited(
        await inviteLead(lead.id, {
          name: name.trim(),
          slug: cleanSlug,
          region: region.trim() || null,
          admin_first_name: first.trim(),
          admin_last_name: last.trim(),
          admin_email: email.trim(),
          admin_phone: phone.trim() || null,
          admin_preferred_language: language,
        }),
      );
    } catch (err) {
      setError(leadError(err));
      setBusy(false);
    }
  }

  const input = { ...leadInput, background: "#fff" };
  const row = { display: "block", marginBottom: 14 } as const;

  return (
    <LeadModal eyebrow={t("inviteModal.eyebrow")} title={t("inviteModal.title")} titleEm={t("inviteModal.titleEm")} width={520} onClose={busy ? () => {} : onClose}>
      <p style={{ margin: "0 0 18px", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>{t("inviteModal.intro")}</p>

      <label style={row}>
        <LeadFieldLabel>{t("inviteModal.name")}</LeadFieldLabel>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={255} style={input} />
      </label>
      <label style={row}>
        <LeadFieldLabel>{t("inviteModal.slug")}</LeadFieldLabel>
        <input value={slug} onChange={(e) => setSlug(e.target.value)} maxLength={100} style={{ ...input, fontFamily: "var(--mono)" }} />
        <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "var(--ink-3)" }}>{t("inviteModal.slugHint")}</span>
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <label style={row}>
          <LeadFieldLabel>{t("inviteModal.firstName")}</LeadFieldLabel>
          <input value={first} onChange={(e) => setFirst(e.target.value)} maxLength={100} style={input} />
        </label>
        <label style={row}>
          <LeadFieldLabel>{t("inviteModal.lastName")}</LeadFieldLabel>
          <input value={last} onChange={(e) => setLast(e.target.value)} maxLength={100} style={input} />
        </label>
      </div>
      <label style={row}>
        <LeadFieldLabel>{t("inviteModal.email")}</LeadFieldLabel>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} style={input} />
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <label style={row}>
          <LeadFieldLabel>{t("inviteModal.phone")}</LeadFieldLabel>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} style={input} />
        </label>
        <label style={row}>
          <LeadFieldLabel>{t("inviteModal.region")}</LeadFieldLabel>
          <input value={region} onChange={(e) => setRegion(e.target.value)} maxLength={100} style={input} />
        </label>
      </div>
      <label style={row}>
        <LeadFieldLabel>{t("inviteModal.language")}</LeadFieldLabel>
        <select value={language} onChange={(e) => setLanguage(e.target.value === "en" ? "en" : "fr")} style={input}>
          <option value="fr">{t("language.fr")}</option>
          <option value="en">{t("language.en")}</option>
        </select>
      </label>

      {error ? <p role="alert" style={{ margin: "0 0 12px", color: "var(--rose)", fontSize: 12.5 }}>{error}</p> : null}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} disabled={busy} style={leadGhostBtn}>{t("inviteModal.cancel")}</button>
        <button type="button" onClick={submit} disabled={busy} style={{ ...leadPrimaryBtn, opacity: busy ? 0.6 : 1 }}>
          <Send size={14} /> {busy ? t("inviteModal.sending") : t("inviteModal.send")}
        </button>
      </div>
    </LeadModal>
  );
}
