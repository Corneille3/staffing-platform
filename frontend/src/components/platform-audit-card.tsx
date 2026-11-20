"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fetchPlatformAudit } from "../lib/browser-api";
import {
  AUDIT_CATEGORIES,
  AUDIT_PAGE_SIZE,
  auditActionKey,
  auditCategory,
  auditDetail,
  type AuditCategory,
} from "../lib/platform-audit";
import type { PlatformAuditRow } from "../lib/types";

// Dot colour per category — names come from `platform.audit.categories`.
const CATEGORY_TONE: Record<string, string> = {
  tenant: "var(--moss)",
  operator: "var(--terra)",
  access: "#8C6B14",
  settings: "var(--ink-2)",
  lead: "var(--ink-3)",
  housekeeping: "var(--rose)",
};

function fmtDateTime(value: string, locale: string): string {
  try {
    return new Date(value).toLocaleString(locale === "fr" ? "fr-CA" : "en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

/** The tier-0 audit trail, newest first — owner only (the API refuses anyone
 * else, the settings page only renders this card for an owner). */
export function PlatformAuditCard() {
  const t = useTranslations("platform.audit");
  const tr = useTranslations("platform.settings.roles");
  const locale = useLocale();
  const [category, setCategory] = useState<AuditCategory | null>(null);
  const [rows, setRows] = useState<PlatformAuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Only the latest request may write: a slow answer for a previous filter
  // must not replace the current list.
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setFailed(false);
    fetchPlatformAudit(category, 0, AUDIT_PAGE_SIZE)
      .then((data) => {
        if (id !== requestId.current) return;
        setRows(data.rows);
        setTotal(data.total);
      })
      .catch(() => {
        if (id !== requestId.current) return;
        setRows([]);
        setTotal(0);
        setFailed(true);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [category, reloadKey]);

  async function loadMore() {
    const id = ++requestId.current;
    setLoading(true);
    setFailed(false);
    try {
      const data = await fetchPlatformAudit(category, rows.length, AUDIT_PAGE_SIZE);
      if (id !== requestId.current) return;
      setRows((current) => [...current, ...data.rows]);
      setTotal(data.total);
    } catch {
      if (id === requestId.current) setFailed(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  const roleName = (role: string) => (tr.has(role) ? tr(role) : role);

  function detailLine(row: PlatformAuditRow): React.ReactNode {
    const detail = auditDetail(row);
    if (!detail) return null;
    if (detail.kind === "role_change") return t("detail.roleChange", { from: roleName(detail.from), to: roleName(detail.to) });
    if (detail.kind === "role") return t("detail.role", { role: roleName(detail.role) });
    if (detail.kind === "reason") return t("detail.reason", { text: detail.text });
    if (detail.kind === "members") return t("detail.members", { count: detail.count });
    return detail.pairs
      .map(([key, value]) => `${t.has(`settingNames.${key}`) ? t(`settingNames.${key}`) : key} : ${value}`)
      .join(" · ");
  }

  return (
    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "14px 22px", borderBottom: "0.5px solid var(--line)" }}>
        <FilterPill active={category === null} onClick={() => setCategory(null)}>
          {t("filterAll")}
        </FilterPill>
        {AUDIT_CATEGORIES.map((value) => (
          <FilterPill key={value} active={category === value} onClick={() => setCategory(value)}>
            {t(`categories.${value}`)}
          </FilterPill>
        ))}
      </div>

      {rows.map((row, index) => {
        const key = auditActionKey(row.action);
        const detail = detailLine(row);
        return (
          <div
            key={row.id}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(140px, 0.9fr) minmax(0, 2.2fr) minmax(0, 1.3fr)",
              gap: 14,
              padding: "12px 22px",
              borderTop: index === 0 ? 0 : "0.5px solid var(--line)",
              alignItems: "start",
              fontSize: 13,
            }}
          >
            <div style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--ink-3)", paddingTop: 2 }}>
              {fmtDateTime(row.created_at, locale)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span
                  aria-hidden
                  style={{ width: 7, height: 7, borderRadius: 99, flexShrink: 0, background: CATEGORY_TONE[auditCategory(row.action)] ?? "var(--ink-3)" }}
                />
                <span style={{ fontWeight: 600 }}>{t.has(`actions.${key}`) ? t(`actions.${key}`) : row.action}</span>
                {row.target_label ? <span style={{ color: "var(--ink-2)", overflowWrap: "anywhere" }}>{row.target_label}</span> : null}
              </div>
              {detail ? (
                <div style={{ marginTop: 3, marginLeft: 15, fontSize: 12, color: "var(--ink-3)", overflowWrap: "anywhere" }}>{detail}</div>
              ) : null}
            </div>
            <div style={{ minWidth: 0, fontSize: 12.5, color: "var(--ink-2)", overflowWrap: "anywhere" }} title={row.actor_email ?? undefined}>
              {row.actor_name ?? t("removedActor")}
            </div>
          </div>
        );
      })}

      {failed ? (
        <div role="alert" style={{ padding: "16px 22px", display: "flex", alignItems: "center", gap: 12, fontSize: 13, color: "var(--rose)" }}>
          <span>{t("loadFailed")}</span>
          <button type="button" onClick={() => (rows.length ? loadMore() : setReloadKey((k) => k + 1))} style={rowBtn}>
            {t("retry")}
          </button>
        </div>
      ) : null}

      {!failed && !loading && rows.length === 0 ? (
        <div style={{ padding: "22px 24px", fontSize: 13, color: "var(--ink-3)" }}>
          {category ? t("emptyFiltered") : t("empty")}
        </div>
      ) : null}

      {loading && rows.length === 0 ? (
        <div style={{ padding: "22px 24px", fontSize: 13, color: "var(--ink-3)" }}>{t("loading")}</div>
      ) : null}

      {rows.length > 0 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 22px", borderTop: "0.5px solid var(--line)", fontSize: 12, color: "var(--ink-3)" }}>
          <span>{t("count", { shown: rows.length, total })}</span>
          {rows.length < total ? (
            <button type="button" onClick={loadMore} disabled={loading} style={{ ...rowBtn, opacity: loading ? 0.5 : 1 }}>
              {loading ? t("loading") : t("loadMore")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: "6px 13px",
        minHeight: 32,
        borderRadius: 999,
        border: active ? "0.5px solid var(--ink)" : "0.5px solid var(--line)",
        background: active ? "var(--ink)" : "transparent",
        color: active ? "var(--paper)" : "var(--ink-2)",
        fontSize: 12,
        fontWeight: 500,
        cursor: "pointer",
        fontFamily: "var(--ui)",
      }}
    >
      {children}
    </button>
  );
}

const card: React.CSSProperties = {
  background: "var(--card)",
  border: "0.5px solid var(--line)",
  borderRadius: "var(--r-lg)",
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
