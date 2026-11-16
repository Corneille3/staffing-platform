"use client";

import { Link } from "../i18n/navigation";
import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCredentialLabel } from "../hooks/use-credential-label";
import { useReadOnlyVisit } from "./read-only-visit";
import { Mono } from "./ui";
import { assignWorker, cancelRequest, fetchAdminRequestsIndex, renotifyRequest } from "../lib/browser-api";
import type { AdminRequestSummary, AdminRequestTab } from "../lib/types";

const STATUS_TONE: Record<string, string> = {
  responses_received: "var(--terra)",
  assigned: "var(--moss)",
  completed: "var(--moss)",
  cancelled: "var(--rose)",
  expired: "var(--ink-3)",
};

type T = ReturnType<typeof useTranslations>;

function relTime(iso: string, t: T): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return t("requests.justNow");
  if (mins < 60) return t("requests.minutesAgo", { n: mins });
  const h = Math.floor(mins / 60);
  if (h < 24) return t("requests.hoursAgo", { n: h });
  return t("requests.daysAgo", { n: Math.floor(h / 24) });
}

function duration(start: string, end: string): string {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h${m}` : `${h}h`;
}

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

interface Props {
  tab: AdminRequestTab;
  initialRows: AdminRequestSummary[];
  initialCursor: string | null;
  siteNames: Record<string, string>;
  siteId?: string;
  urgency?: string;
  language?: string;
}

export function AdminRequestsList({ tab, initialRows, initialCursor, siteNames, siteId, urgency, language }: Props) {
  const t = useTranslations("admin.requests");
  const tCommon = useTranslations("common");
  const [rows, setRows] = useState(initialRows);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  // The page polls via router.refresh(), which hands us a fresh first page.
  // Adopt it as the head and keep whatever older pages were loaded through
  // the cursor (deduped) so pagination survives a background refresh.
  const olderIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    setRows((prev) => {
      const headIds = new Set(initialRows.map((r) => r.id));
      const older = prev.filter((r) => olderIds.current.has(r.id) && !headIds.has(r.id));
      return [...initialRows, ...older];
    });
  }, [initialRows]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadOlder() {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const page = await fetchAdminRequestsIndex({ tab, cursor, siteId, urgency, language });
      for (const item of page.items) olderIds.current.add(item.id);
      setRows((prev) => [...prev, ...page.items]);
      setCursor(page.next_cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleAssign(row: AdminRequestSummary) {
    if (!row.top_match) return;
    setBusyId(row.id);
    setError(null);
    try {
      await assignWorker(row.id, row.top_match.user_id);
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, status: "assigned", assigned_worker: { user_id: row.top_match!.user_id, name: row.top_match!.name }, top_match: null }
            : r,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t("assignFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(row: AdminRequestSummary) {
    const reason = window.prompt(t("cancelPrompt"), "");
    if (reason === null) return;
    setBusyId(row.id);
    setError(null);
    try {
      await cancelRequest(row.id, reason || t("cancelDefaultReason"));
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("cancelFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function handleNotifyMore(row: AdminRequestSummary) {
    setBusyId(row.id);
    setError(null);
    try {
      await renotifyRequest(row.id);
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: r.status === "open" ? "notified" : r.status } : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("notifyFailed"));
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div style={{ background: "var(--card)", border: "0.5px solid var(--line)", borderRadius: "var(--r-md)", padding: "36px 20px", textAlign: "center" }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: 0, fontWeight: 400, color: "var(--ink)" }}>
          {t("emptyLead")} <em style={{ fontStyle: "italic" }}>{t("emptyEm")}</em>.
        </h2>
        <p style={{ color: "var(--ink-3)", fontSize: 13, marginTop: 6 }}>{t("emptyBody")}</p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {error && <p style={{ color: "var(--rose)", fontSize: 13, fontWeight: 600, margin: 0 }}>{error}</p>}
      {rows.map((row) => (
        <RequestRow
          key={row.id}
          row={row}
          siteName={siteNames[row.organization_id] ?? ""}
          busy={busyId === row.id}
          onAssign={() => handleAssign(row)}
          onCancel={() => handleCancel(row)}
          onNotifyMore={() => handleNotifyMore(row)}
        />
      ))}
      {cursor && (
        <button
          onClick={loadOlder}
          disabled={loading}
          style={{
            justifySelf: "center",
            marginTop: 8,
            padding: "10px 20px",
            borderRadius: 999,
            background: "transparent",
            border: "0.5px solid var(--line)",
            color: "var(--ink)",
            fontFamily: "var(--ui)",
            fontSize: 13,
            fontWeight: 500,
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? tCommon("loading") : t("loadOlder")}
        </button>
      )}
    </div>
  );
}

function RequestRow({
  row,
  siteName,
  busy,
  onAssign,
  onCancel,
  onNotifyMore,
}: {
  row: AdminRequestSummary;
  siteName: string;
  busy: boolean;
  onAssign: () => void;
  onCancel: () => void;
  onNotifyMore: () => void;
}) {
  const t = useTranslations("admin");
  const credentialLabel = useCredentialLabel();
  const statusTone = STATUS_TONE[row.status] ?? "var(--ink-3)";
  // A read-only visitor gets the View link and no overflow menu.
  const readOnlyVisit = useReadOnlyVisit();
  const canAssign = row.top_match && row.status !== "assigned" && !readOnlyVisit;

  return (
    <div
      style={{
        background: "var(--card)",
        border: "0.5px solid var(--line)",
        borderLeft: row.urgent && row.status !== "assigned" ? "3px solid var(--terra)" : "0.5px solid var(--line)",
        borderRadius: "var(--r-md)",
        padding: "14px 16px",
        display: "grid",
        gridTemplateColumns: "118px 1.4fr 1fr 1.1fr auto",
        gap: "0 14px",
        alignItems: "center",
      }}
    >
      {/* 1 · id + urgent + posted */}
      <div>
        <Mono style={{ fontSize: 11, color: "var(--ink-2)", fontWeight: 600 }}>{row.public_id}</Mono>
        {row.urgent && (
          <span style={{ display: "inline-block", marginLeft: 6, fontSize: 9, fontWeight: 700, color: "var(--terra)", letterSpacing: ".08em" }}>
            {t("requests.urgentTag")}
          </span>
        )}
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{relTime(row.created_at, t)}</div>
      </div>

      {/* 2 · role + time + chips */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
          {row.role ? (t.has(`roles.${row.role}`) ? t(`roles.${row.role}`) : row.role) : t("roles.other")}
          <span style={{ color: "var(--ink-3)", fontWeight: 400 }}> · </span>
          <Mono style={{ fontSize: 13 }}>{row.start_time.slice(0, 5)}→{row.end_time.slice(0, 5)}</Mono>
          <span style={{ color: "var(--ink-3)", fontWeight: 400, fontSize: 12 }}> {duration(row.start_time, row.end_time)}</span>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
          {siteName && <RowChip>{siteName}</RowChip>}
          {row.language_requirement && <RowChip>{t.has(`languages.${row.language_requirement}`) ? t(`languages.${row.language_requirement}`) : row.language_requirement}</RowChip>}
          {row.required_qualifications.slice(0, 2).map((q) => <RowChip key={q}>{credentialLabel(q)}</RowChip>)}
        </div>
      </div>

      {/* 3 · status + progress */}
      <div>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: statusTone }}>
          {t.has(`status.${row.status}`) ? t(`status.${row.status}`) : row.status}
        </span>
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3 }}>
          {t("requests.metrics", { notified: row.metrics.notified, accepted: row.metrics.accepted, declined: row.metrics.declined })}
        </div>
      </div>

      {/* 4 · people */}
      <div style={{ minWidth: 0 }}>
        {row.assigned_worker ? (
          <Person name={row.assigned_worker.name} tone="moss" label={t("requests.personAssigned")} />
        ) : row.top_match ? (
          <Person
            name={row.top_match.name}
            tone="terra"
            label={row.top_match.match_score != null ? t("requests.topMatchScore", { score: row.top_match.match_score }) : t("requests.topMatch")}
          />
        ) : (
          <span style={{ fontSize: 12, color: "var(--ink-3)", fontStyle: "italic" }}>
            {row.status === "responses_received" ? t("requests.awaitingAcceptor") : t("requests.notifying")}
          </span>
        )}
      </div>

      {/* 5 · action */}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        {canAssign ? (
          <button
            onClick={onAssign}
            disabled={busy}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              border: "none",
              background: "var(--terra)",
              color: "#fff",
              fontFamily: "var(--ui)",
              fontSize: 13,
              fontWeight: 600,
              cursor: busy ? "wait" : "pointer",
              opacity: busy ? 0.6 : 1,
              minHeight: 38,
            }}
          >
            {busy ? t("requests.assigning") : t("requests.assign")}
          </button>
        ) : (
          <Link
            href={`/admin/requests/${row.id}`}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              border: "0.5px solid var(--line)",
              background: "transparent",
              color: "var(--ink-2)",
              fontFamily: "var(--ui)",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              minHeight: 38,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            {t("requests.view")}
          </Link>
        )}
        {row.status !== "assigned" && !readOnlyVisit && (
          <OverflowMenu busy={busy} onCancel={onCancel} onNotifyMore={onNotifyMore} />
        )}
      </div>
    </div>
  );
}

function OverflowMenu({ busy, onCancel, onNotifyMore }: { busy: boolean; onCancel: () => void; onNotifyMore: () => void }) {
  const t = useTranslations("admin.requests");
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-label={t("moreActions")}
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          border: "0.5px solid var(--line)",
          background: "transparent",
          color: "var(--ink-3)",
          cursor: busy ? "wait" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              right: 0,
              zIndex: 21,
              background: "var(--card)",
              border: "0.5px solid var(--line)",
              borderRadius: 10,
              padding: 4,
              minWidth: 160,
              boxShadow: "0 8px 24px rgba(21,20,15,.12)",
            }}
          >
            <MenuItem label={t("notifyMore")} onClick={() => { setOpen(false); onNotifyMore(); }} />
            <MenuItem label={t("cancelRequest")} tone="var(--rose)" onClick={() => { setOpen(false); onCancel(); }} />
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ label, onClick, tone }: { label: string; onClick: () => void; tone?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "8px 10px",
        background: "transparent",
        border: "none",
        borderRadius: 8,
        cursor: "pointer",
        fontFamily: "var(--ui)",
        fontSize: 13,
        fontWeight: 500,
        color: tone ?? "var(--ink)",
      }}
    >
      {label}
    </button>
  );
}

function RowChip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ padding: "2px 8px", fontSize: 11, fontWeight: 500, borderRadius: 999, background: "var(--paper-2)", color: "var(--ink-2)", border: "0.5px solid var(--line)", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function Person({ name, tone, label }: { name: string; tone: "moss" | "terra"; label: string }) {
  const color = tone === "moss" ? "var(--moss)" : "var(--terra)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <div style={{ width: 30, height: 30, borderRadius: 99, background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
        {initials(name)}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
        <div style={{ fontSize: 10, color, fontWeight: 600 }}>{label}</div>
      </div>
    </div>
  );
}
