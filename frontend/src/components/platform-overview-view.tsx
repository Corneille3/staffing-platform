"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Check, Info } from "lucide-react";
import { Link } from "../i18n/navigation";
import { auditActionKey } from "../lib/platform-audit";
import {
  PIPELINE_CLOSED,
  PIPELINE_OPEN,
  attentionCount,
  attentionHref,
  isKnownAttention,
} from "../lib/platform-overview";
import type { OverviewAttentionItem, PlatformOverview } from "../lib/types";

// Tenant statuses in lifecycle order; colours only — names come from
// `platform.tenants.status`.
const TENANT_STATUSES = [
  { key: "pending", c: "#8C6B14" },
  { key: "onboarding", c: "var(--terra)" },
  { key: "active", c: "var(--moss)" },
  { key: "suspended", c: "var(--rose)" },
] as const;

const SHIFT_TZ = "America/Toronto";

function localeTag(locale: string): string {
  return locale === "fr" ? "fr-CA" : "en-CA";
}

function fmtToday(value: string, locale: string): string {
  try {
    const day = new Date(value).toLocaleDateString(localeTag(locale), {
      weekday: "long", day: "numeric", month: "long", timeZone: SHIFT_TZ,
    });
    // First letter only: CSS `capitalize` would also write « Novembre ».
    return day.charAt(0).toUpperCase() + day.slice(1);
  } catch {
    return "";
  }
}

function fmtStamp(value: string, locale: string): string {
  try {
    return new Date(value).toLocaleString(localeTag(locale), {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: SHIFT_TZ,
    });
  } catch {
    return value;
  }
}

/** `/platform` landing: what needs the operator's attention today, then the
 * counts. The API decides what each role receives — a block whose data is
 * null (pipeline and audit trail for anyone but an owner) is not rendered. */
export function PlatformOverviewView({ data }: { data: PlatformOverview }) {
  const t = useTranslations("platform.overview");
  const locale = useLocale();
  const items = data.attention.filter(isKnownAttention);
  const toAct = attentionCount(items);

  return (
    <div style={{ padding: "32px 36px 64px", maxWidth: 1180 }}>
      <div style={{ marginBottom: 24 }}>
        <div className="stf-h-eyebrow" style={eyebrow}>{t("eyebrow")}</div>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: "clamp(2rem, 4vw, 2.75rem)", lineHeight: 1.02, margin: "6px 0 0", letterSpacing: "-0.02em", fontWeight: 400 }}>
          {t.rich("headline", { em: (chunks) => <em style={{ fontStyle: "italic" }}>{chunks}</em> })}
        </h1>
        <p style={{ margin: "8px 0 0", color: "var(--ink-3)", fontSize: 13 }}>
          {fmtToday(data.generated_at, locale)}
        </p>
      </div>

      {/* ── To watch ── */}
      <SectionTitle>
        {t("attention.title")}
        {toAct > 0 ? <CountPill>{toAct}</CountPill> : null}
      </SectionTitle>
      {items.length === 0 ? (
        <div role="status" style={{ ...card, padding: "18px 20px", background: "var(--moss-soft)", borderColor: "transparent", display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <Check size={18} style={{ color: "var(--moss)", flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--moss)" }}>{t("attention.emptyTitle")}</div>
            <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 2 }}>{t("attention.emptyBody")}</div>
          </div>
        </div>
      ) : (
        <div style={{ ...card, marginBottom: 28, overflow: "hidden" }}>
          {items.map((item, i) => (
            <AttentionRow key={`${item.kind}-${item.tenant_id ?? item.lead_id ?? i}`} item={item} last={i === items.length - 1} />
          ))}
        </div>
      )}

      {/* ── Tenants + activity ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18, marginBottom: 28, alignItems: "start" }}>
        <div>
          <SectionTitle link={{ href: "/platform/tenants", label: t("tenants.open") }}>{t("tenants.title")}</SectionTitle>
          <div style={{ ...card, padding: "6px 20px" }}>
            {TENANT_STATUSES.map((status, i) => (
              <div key={status.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderBottom: i === TENANT_STATUSES.length - 1 ? "none" : "0.5px solid var(--line)" }}>
                <span style={{ width: 6, height: 6, borderRadius: 99, background: status.c, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13.5 }}>{t(`tenants.${status.key}`)}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 14, color: data.tenants[status.key] ? "var(--ink)" : "var(--ink-4)" }}>
                  {data.tenants[status.key]}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <SectionTitle>{t("activity.title", { days: data.activity.days })}</SectionTitle>
          <div style={{ ...card, padding: "6px 20px" }}>
            <Stat label={t("activity.published")} value={String(data.activity.published)} />
            <Stat label={t("activity.filled")} value={String(data.activity.filled)} />
            <Stat
              label={t("activity.rate")}
              value={data.activity.fill_rate == null ? "—" : `${data.activity.fill_rate} %`}
              tone={data.activity.fill_rate == null ? undefined : "moss"}
            />
            <Stat
              label={t("activity.expired")}
              value={String(data.activity.expired)}
              tone={data.activity.expired > 0 ? "terra" : undefined}
              last
            />
          </div>
          <p style={{ margin: "8px 2px 0", fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.45 }}>{t("activity.note")}</p>
        </div>
      </div>

      {/* ── Sales pipeline (owner) ── */}
      {data.leads ? (
        <div style={{ marginBottom: 28 }}>
          <SectionTitle link={{ href: "/platform/leads", label: t("leads.open") }}>
            {t("leads.title", { count: data.leads.open_pipeline })}
          </SectionTitle>
          <div style={{ ...card, padding: "16px 20px", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "stretch" }}>
            {PIPELINE_OPEN.map((status) => (
              <StageCell key={status} status={status} count={data.leads!.by_status[status] ?? 0} />
            ))}
            <span aria-hidden style={{ width: 0.5, background: "var(--line)", margin: "0 6px" }} />
            {PIPELINE_CLOSED.map((status) => (
              <StageCell key={status} status={status} count={data.leads!.by_status[status] ?? 0} closed />
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Audit trail (owner) ── */}
      {data.audit ? (
        <div>
          <SectionTitle link={{ href: "/platform/settings", label: t("audit.open") }}>
            {t("audit.title", { count: data.audit.length })}
          </SectionTitle>
          <div style={{ ...card, padding: data.audit.length ? "4px 20px" : "16px 20px" }}>
            {data.audit.length === 0 ? (
              <span style={{ fontSize: 13, color: "var(--ink-3)" }}>{t("audit.empty")}</span>
            ) : (
              data.audit.map((row, i) => (
                <AuditLine key={row.id} row={row} last={i === data.audit!.length - 1} locale={locale} />
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── pieces ───────────────────────────────────────────────────────────────────

function AttentionRow({ item, last }: { item: OverviewAttentionItem; last: boolean }) {
  const t = useTranslations("platform.overview.attention");
  const info = item.info_only;
  return (
    <Link
      href={attentionHref(item)}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", minHeight: 44,
        textDecoration: "none", color: "inherit",
        borderBottom: last ? "none" : "0.5px solid var(--line)",
      }}
    >
      {info ? (
        <Info size={14} style={{ color: "var(--ink-3)", flexShrink: 0 }} />
      ) : (
        <span style={{ width: 7, height: 7, borderRadius: 99, background: "var(--terra)", flexShrink: 0, margin: "0 3.5px" }} />
      )}
      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: info ? "var(--ink-2)" : "var(--ink)" }}>
        {t(`kinds.${item.kind}`, { count: item.count, name: item.name ?? "", days: item.days ?? 0 })}
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--ink-3)", flexShrink: 0 }}>
        {t("see")} <ArrowRight size={13} />
      </span>
    </Link>
  );
}

function StageCell({ status, count, closed }: { status: string; count: number; closed?: boolean }) {
  const t = useTranslations("platform.leads.status");
  return (
    <Link
      href={`/platform/leads?status=${status}`}
      style={{ flex: "1 1 96px", minWidth: 96, padding: "10px 12px", borderRadius: 12, background: closed ? "transparent" : "var(--paper-2)", textDecoration: "none", color: "inherit", minHeight: 44 }}
    >
      <div style={{ fontSize: 11.5, color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t(status)}</div>
      <div style={{ fontFamily: "var(--serif)", fontSize: 26, lineHeight: 1.1, marginTop: 4, color: count ? "var(--ink)" : "var(--ink-4)" }}>{count}</div>
    </Link>
  );
}

function AuditLine({ row, last, locale }: { row: NonNullable<PlatformOverview["audit"]>[number]; last: boolean; locale: string }) {
  const t = useTranslations("platform.audit");
  const key = `actions.${auditActionKey(row.action)}`;
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 14, padding: "12px 0", borderBottom: last ? "none" : "0.5px solid var(--line)", flexWrap: "wrap" }}>
      <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--ink-3)", width: 118, flexShrink: 0 }}>{fmtStamp(row.created_at, locale)}</span>
      <span style={{ fontSize: 13.5, flex: "1 1 180px", minWidth: 0 }}>
        {t.has(key) ? t(key) : row.action}
        {row.target_label ? <span style={{ color: "var(--ink-2)" }}> · {row.target_label}</span> : null}
      </span>
      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{row.actor_name ?? "—"}</span>
    </div>
  );
}

function Stat({ label, value, tone, last }: { label: string; value: string; tone?: "moss" | "terra"; last?: boolean }) {
  const color = tone === "moss" ? "var(--moss)" : tone === "terra" ? "var(--terra-ink)" : "var(--ink)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderBottom: last ? "none" : "0.5px solid var(--line)" }}>
      <span style={{ flex: 1, fontSize: 13.5 }}>{label}</span>
      <span style={{ fontFamily: "var(--mono)", fontSize: 14, color }}>{value}</span>
    </div>
  );
}

function SectionTitle({ children, link }: { children: React.ReactNode; link?: { href: string; label: string } }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10, minHeight: 20 }}>
      <h2 className="stf-h-eyebrow" style={{ ...eyebrow, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>{children}</h2>
      {link ? (
        <Link href={link.href} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--ink-2)", textDecoration: "none" }}>
          {link.label} <ArrowRight size={13} />
        </Link>
      ) : null}
    </div>
  );
}

function CountPill({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: 0, padding: "2px 8px", borderRadius: 999, background: "var(--terra-soft)", color: "var(--terra-ink)" }}>
      {children}
    </span>
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
