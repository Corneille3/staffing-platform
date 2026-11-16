"use client";

import { Link } from "../i18n/navigation";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { AdminActivityFilter, ApfActivityRow } from "../lib/types";
import { fetchAdminActivity } from "../lib/browser-api";
import { Mono } from "./ui";
import { ActivityDateHeader, activityActionKey, activityRelativeTime, groupByDate } from "./apf-activity-row";
import { shiftTime } from "../lib/shift-time";

function requestIdFor(row: ApfActivityRow): string | null {
  if (row.entity_type === "staffing_request" && row.entity_id) return row.entity_id;
  const p = row.payload?.staffing_request_id;
  return typeof p === "string" ? p : null;
}

type Kind = { verb: string; kind: string; tone: string };

const ACTION_KIND: Record<string, Kind> = {
  "staffing_request.published": { verb: "posted", kind: "Posted", tone: "var(--terra)" },
  "staffing_request.created": { verb: "drafted", kind: "Draft", tone: "var(--ink-3)" },
  "staffing_request.completed": { verb: "completed", kind: "Completed", tone: "var(--moss)" },
  "staffing_request.cancelled": { verb: "cancelled the request", kind: "Cancelled", tone: "var(--rose)" },
  "staffing_request.renotified": { verb: "re-notified", kind: "Re-notified", tone: "var(--terra)" },
  "request_response.accepted": { verb: "accepted", kind: "Accepted", tone: "var(--moss)" },
  "request_response.declined": { verb: "declined", kind: "Declined", tone: "var(--rose)" },
  "request_response.viewed": { verb: "viewed", kind: "Viewed", tone: "var(--sand)" },
  "request_response.withdrawn": { verb: "withdrew", kind: "Withdrawn", tone: "var(--rose)" },
  "assignment.confirmed": { verb: "assigned", kind: "Assigned", tone: "var(--moss)" },
  "assignment.cancelled": { verb: "cancelled the assignment", kind: "Cancelled", tone: "var(--rose)" },
  "replacement.unfilled": { verb: "expired unfilled", kind: "Expired", tone: "var(--rose)" },
  "replacement.escalated": { verb: "escalated", kind: "Escalated", tone: "var(--sand)" },
  "assignment.no_show_alerted": { verb: "no-show alert sent", kind: "No-show", tone: "var(--rose)" },
  "assignment.checkin_reminder_sent": { verb: "check-in reminder sent", kind: "Reminder", tone: "var(--ink-3)" },
  "assignment.checkout_reminder_sent": { verb: "check-out reminder sent", kind: "Reminder", tone: "var(--ink-3)" },
  "assignment.checked_in": { verb: "checked in", kind: "Checked in", tone: "var(--moss)" },
  "worker.invited": { verb: "invited a substitute", kind: "Invited", tone: "var(--terra)" },
  "coordinator.invited": { verb: "invited a coordinator", kind: "Invited", tone: "var(--terra)" },
};

function kindFor(action: string): Kind {
  return ACTION_KIND[action] ?? { verb: action.replace(/\./g, " · "), kind: "Event", tone: "var(--ink-3)" };
}

// Wall-clock in the shift timezone — an ISO slice would print UTC
// ("01:09" for a 21:09 Montréal event).
function timeOfDay(iso: string): string {
  return shiftTime(iso);
}

function Chip({ label, tone, soft }: { label: string; tone: string; soft?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 9px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: "nowrap",
        color: soft ? "var(--ink-2)" : tone,
        background: soft ? "var(--paper-2)" : "transparent",
        border: `0.5px solid ${soft ? "var(--line)" : tone}`,
      }}
    >
      {label}
    </span>
  );
}

function AdminActivityRow({ row }: { row: ApfActivityRow }) {
  const t = useTranslations("admin.activity");
  const tTime = useTranslations("admin.requests");
  const base = kindFor(row.action);
  const actionKey = `actions.${activityActionKey(row.action)}`;
  const known = row.action in ACTION_KIND;
  const k = {
    tone: base.tone,
    verb: t.has(`${actionKey}.verb`) ? t(`${actionKey}.verb`) : base.verb,
    kind: t.has(`${actionKey}.kind`) ? t(`${actionKey}.kind`) : known ? base.kind : t("event"),
  };
  const actorName = row.actor ? `${row.actor.first_name} ${row.actor.last_name}` : t("system");
  const actorRole = row.actor
    ? t.has(`actorRoles.${row.actor.role}`) ? t(`actorRoles.${row.actor.role}`) : row.actor.role
    : null;
  const reason = typeof row.payload?.reason === "string" ? row.payload.reason : null;

  return (
    <div
      style={{
        background: "var(--card)",
        border: "0.5px solid var(--line)",
        borderRadius: "var(--r-md)",
        padding: "14px 16px",
        display: "grid",
        gridTemplateColumns: "52px 28px 1fr auto",
        gap: "0 12px",
        alignItems: "center",
      }}
    >
      <Mono style={{ fontSize: 11, color: "var(--ink-3)" }}>{timeOfDay(row.created_at)}</Mono>

      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: k.tone,
          opacity: 0.16,
          display: "block",
          position: "relative",
        }}
      >
        <span style={{ position: "absolute", inset: 0, borderRadius: 8, border: `1.5px solid ${k.tone}`, opacity: 1.8 }} />
      </span>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, color: "var(--ink)" }}>
          <strong style={{ fontWeight: 600 }}>{actorName}</strong> {k.verb}
          {row.request_title ? <> · <span style={{ color: "var(--ink-2)" }}>{row.request_title}</span></> : null}
          {!row.request_title && row.subject ? <> · <span style={{ color: "var(--ink-2)" }}>{row.subject}</span></> : null}
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
          {actorRole ? `${actorRole} · ` : ""}
          {activityRelativeTime(row.created_at, tTime)}
          {reason ? <> · <span style={{ color: "var(--rose)" }}>{t("reason", { reason })}</span></> : null}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        {row.organization && <Chip label={row.organization.name} tone="var(--ink-2)" soft />}
        <Chip label={k.kind} tone={k.tone} />
      </div>
    </div>
  );
}

interface Props {
  filter: AdminActivityFilter;
  initialRows: ApfActivityRow[];
  initialCursor: string | null;
  siteId?: string;
}

export function AdminActivityList({ filter, initialRows, initialCursor, siteId }: Props) {
  const t = useTranslations("admin.activity");
  const tReq = useTranslations("admin.requests");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [rows, setRows] = useState<ApfActivityRow[]>(initialRows);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadOlder() {
    if (!cursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchAdminActivity({ filter, cursor, siteId });
      setRows((prev) => [...prev, ...page.items]);
      setCursor(page.next_cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  if (rows.length === 0) {
    return (
      <div style={{ background: "var(--card)", border: "0.5px solid var(--line)", borderRadius: "var(--r-md)", padding: "32px 20px", textAlign: "center" }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 20, margin: 0, fontWeight: 400, color: "var(--ink)" }}>
          {tReq("emptyLead")} <em style={{ fontStyle: "italic" }}>{tReq("emptyEm")}</em>.
        </h2>
        <p style={{ color: "var(--ink-3)", fontSize: 13, marginTop: 6 }}>{t("emptyBody")}</p>
      </div>
    );
  }

  const groups = groupByDate(rows, { today: t("today"), yesterday: t("yesterday"), locale: locale === "fr" ? "fr-CA" : "en-CA" });

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {groups.map((group) => (
        <div key={group.key}>
          <ActivityDateHeader label={group.label} />
          <div style={{ display: "grid", gap: 8 }}>
            {group.entries.map((row) => {
              const reqId = requestIdFor(row);
              return reqId ? (
                <Link key={row.id} href={`/admin/requests/${reqId}`} style={{ textDecoration: "none" }}>
                  <AdminActivityRow row={row} />
                </Link>
              ) : (
                <AdminActivityRow key={row.id} row={row} />
              );
            })}
          </div>
        </div>
      ))}

      {error && <p style={{ color: "var(--rose)", fontSize: 13, fontWeight: 600 }}>{error}</p>}

      {cursor && (
        <button
          onClick={loadOlder}
          disabled={loading}
          style={{
            justifySelf: "center",
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
          {loading ? tCommon("loading") : tReq("loadOlder")}
        </button>
      )}
    </div>
  );
}
