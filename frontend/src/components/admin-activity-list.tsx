"use client";

import { useState } from "react";
import type { AdminActivityFilter, ApfActivityRow } from "../lib/types";
import { fetchAdminActivity } from "../lib/browser-api";
import { Mono } from "./ui";
import { ActivityDateHeader, groupByDate } from "./apf-activity-row";

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
  "assignment.checked_in": { verb: "checked in", kind: "Checked in", tone: "var(--moss)" },
  "worker.invited": { verb: "invited a substitute", kind: "Invited", tone: "var(--terra)" },
  "coordinator.invited": { verb: "invited a coordinator", kind: "Invited", tone: "var(--terra)" },
};

const ROLE_LABEL: Record<string, string> = {
  worker: "substitute",
  org_admin: "coordinator",
  network_admin: "APF admin",
  platform_admin: "platform admin",
};

function kindFor(action: string): Kind {
  return ACTION_KIND[action] ?? { verb: action.replace(/\./g, " · "), kind: "Event", tone: "var(--ink-3)" };
}

function relativeTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function timeOfDay(iso: string): string {
  return iso.slice(11, 16);
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
  const k = kindFor(row.action);
  const actorName = row.actor ? `${row.actor.first_name} ${row.actor.last_name}` : "System";
  const actorRole = row.actor ? ROLE_LABEL[row.actor.role] ?? row.actor.role : null;
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
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
          {actorRole ? `${actorRole} · ` : ""}
          {relativeTime(row.created_at)}
          {reason ? <> · <span style={{ color: "var(--rose)" }}>Reason: {reason}</span></> : null}
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
      setError(err instanceof Error ? err.message : "Failed to load older activity");
    } finally {
      setLoading(false);
    }
  }

  if (rows.length === 0) {
    return (
      <div style={{ background: "var(--card)", border: "0.5px solid var(--line)", borderRadius: "var(--r-md)", padding: "32px 20px", textAlign: "center" }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 20, margin: 0, fontWeight: 400, color: "var(--ink)" }}>
          Nothing to see <em style={{ fontStyle: "italic" }}>here</em>.
        </h2>
        <p style={{ color: "var(--ink-3)", fontSize: 13, marginTop: 6 }}>No activity recorded for this filter.</p>
      </div>
    );
  }

  const groups = groupByDate(rows);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {groups.map((group) => (
        <div key={group.key}>
          <ActivityDateHeader label={group.label} />
          <div style={{ display: "grid", gap: 8 }}>
            {group.entries.map((row) => (
              <AdminActivityRow key={row.id} row={row} />
            ))}
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
          {loading ? "Loading…" : "Load older →"}
        </button>
      )}
    </div>
  );
}
