import { Mono } from "./ui";
import type { ApfActivityRow } from "../lib/types";
import { shiftDateKey } from "../lib/shift-time";

type ActionMeta = { label: string; accent: string };

const ACTION_META: Record<string, ActionMeta> = {
  "staffing_request.created":      { label: "Request created",      accent: "var(--sand)" },
  "staffing_request.published":    { label: "Request published",    accent: "var(--sand)" },
  "staffing_request.cancelled":    { label: "Request cancelled",    accent: "var(--rose)" },
  "staffing_request.completed":    { label: "Request completed",    accent: "var(--moss)" },
  "staffing_request.renotified":   { label: "Request re-notified",  accent: "var(--terra)" },
  "request_response.accepted":     { label: "Response accepted",    accent: "var(--moss)" },
  "request_response.declined":     { label: "Response declined",    accent: "var(--rose)" },
  "request_response.viewed":       { label: "Response viewed",      accent: "var(--sand)" },
  "request_response.withdrawn":    { label: "Response withdrawn",   accent: "var(--rose)" },
  "request_response.no_response":  { label: "No response",          accent: "var(--ink-3)" },
  "assignment.confirmed":          { label: "Assignment confirmed", accent: "var(--moss)" },
  "assignment.cancelled":          { label: "Assignment cancelled", accent: "var(--rose)" },
  "coordinator.invited":           { label: "Coordinator invited",  accent: "var(--terra)" },
  "worker.invited":                { label: "Substitute invited",   accent: "var(--terra)" },
  "worker.onboarded":              { label: "Substitute onboarded", accent: "var(--moss)" },
  "worker.availability_updated":   { label: "Availability updated", accent: "var(--sand)" },
  "tenant.created":                { label: "Network created",      accent: "var(--terra)" },
  "tenant.removed":                { label: "Network removed",      accent: "var(--rose)" },
  "user.removed":                  { label: "User removed",         accent: "var(--rose)" },
};

const ROLE_LABEL: Record<string, string> = {
  worker: "substitute",
  org_admin: "coordinator",
  network_admin: "APF admin",
  platform_admin: "platform admin",
};

function meta(action: string): ActionMeta {
  return ACTION_META[action] ?? { label: action.replace(/\./g, " · "), accent: "var(--ink-3)" };
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ActivityRowCard({ row }: { row: ApfActivityRow }) {
  const m = meta(row.action);
  const actorName = row.actor
    ? `${row.actor.first_name} ${row.actor.last_name}`
    : "System";
  const actorRoleLabel = row.actor ? ROLE_LABEL[row.actor.role] ?? row.actor.role : null;

  return (
    <div
      style={{
        background: "var(--card)",
        border: "0.5px solid var(--line)",
        display: "grid",
        gridTemplateColumns: "28px 1fr auto",
        gap: "0 14px",
        padding: "14px 16px",
        borderRadius: "var(--r-md)",
        alignItems: "start",
      }}
    >
      <div style={{ paddingTop: 3, display: "flex", justifyContent: "center" }}>
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 3,
            background: m.accent,
            display: "block",
            flexShrink: 0,
          }}
        />
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: m.accent,
            }}
          >
            {m.label}
          </span>
          {row.organization && (
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{row.organization.name}</span>
          )}
        </div>

        {(row.request_title || row.subject) && (
          <div style={{ marginTop: 4, fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
            {row.request_title ?? row.subject}
          </div>
        )}

        <div style={{ marginTop: 4, fontSize: 12, color: "var(--ink-3)" }}>
          by {actorName}
          {actorRoleLabel ? ` · ${actorRoleLabel}` : ""}
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
        <Mono>{relativeTime(row.created_at)}</Mono>
      </div>
    </div>
  );
}

// Day groups follow the Québec calendar, not the UTC one: `created_at` is a
// UTC instant, and slicing its date put every evening action (after 20:00
// local) under tomorrow's header (finding #18).
function dayKey(iso: string): string {
  return shiftDateKey(iso);
}

function dayLabel(key: string): string {
  const now = Date.now();
  if (key === shiftDateKey(now)) return "Today";
  if (key === shiftDateKey(now - 86_400_000)) return "Yesterday";
  try {
    // The key is a plain date; pin the formatter to UTC so a "YYYY-MM-DD"
    // parsed as UTC midnight doesn't render as the previous day in a
    // negative-offset browser.
    return new Date(key).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return key;
  }
}

export function groupByDate(
  rows: ApfActivityRow[],
): { key: string; label: string; entries: ApfActivityRow[] }[] {
  const groups: { key: string; label: string; entries: ApfActivityRow[] }[] = [];
  for (const row of rows) {
    const key = dayKey(row.created_at);
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.entries.push(row);
    } else {
      groups.push({ key, label: dayLabel(key), entries: [row] });
    }
  }
  return groups;
}

export function ActivityDateHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        color: "var(--ink-3)",
        marginBottom: 12,
        paddingBottom: 8,
        borderBottom: "0.5px solid var(--line)",
        fontWeight: 500,
      }}
    >
      <Mono>{label}</Mono>
    </div>
  );
}
