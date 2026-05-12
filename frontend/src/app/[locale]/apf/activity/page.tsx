import { getAuditLogs, getOrganizations, getRequests, getUsers } from "../../../../lib/api";
import { AuditLog } from "../../../../lib/types";

// ─── action metadata ──────────────────────────────────────────────────────────

type ActionMeta = { label: string; accent: string; dot: string };

const ACTION_META: Record<string, ActionMeta> = {
  "staffing_request.created":   { label: "Request created",   accent: "#88b8d4", dot: "#88b8d4" },
  "staffing_request.published": { label: "Request published",  accent: "#a4c8a3", dot: "#a4c8a3" },
  "staffing_request.cancelled": { label: "Request cancelled",  accent: "#d6806a", dot: "#d6806a" },
  "staffing_request.completed": { label: "Request completed",  accent: "#6db896", dot: "#6db896" },
  "request_response.accepted":  { label: "Response accepted",  accent: "#a4c8a3", dot: "#a4c8a3" },
  "request_response.declined":  { label: "Response declined",  accent: "#d6a08c", dot: "#d6a08c" },
  "request_response.viewed":    { label: "Response viewed",    accent: "#c8b88c", dot: "#c8b88c" },
  "assignment.confirmed":       { label: "Assignment confirmed", accent: "#6db896", dot: "#6db896" },
  "assignment.cancelled":       { label: "Assignment cancelled", accent: "#d6806a", dot: "#d6806a" },
};

function meta(action: string): ActionMeta {
  return ACTION_META[action] ?? { label: action.replace(/\./g, " · "), accent: "rgba(247,240,223,0.5)", dot: "rgba(247,240,223,0.3)" };
}

// ─── relative time ────────────────────────────────────────────────────────────

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

// ─── context line ─────────────────────────────────────────────────────────────

function contextLine(log: AuditLog, requestTitleMap: Map<string, string>): string | null {
  const payload = log.payload;

  if (log.entity_type === "staffing_request") {
    const title = requestTitleMap.get(log.entity_id);
    if (title) return title;
  }

  const srId =
    (payload.staffing_request_id as string | undefined) ??
    (log.entity_type === "staffing_request" ? log.entity_id : undefined);

  if (srId) {
    const title = requestTitleMap.get(srId);
    if (title) return title;
  }

  return null;
}

// ─── page ────────────────────────────────────────────────────────────────────

export default async function ActivityPage() {
  const [logs, users, organizations, requests] = await Promise.all([
    getAuditLogs(),
    getUsers(),
    getOrganizations(),
    getRequests(),
  ]);

  const userMap = new Map(users.map((u) => [u.id, `${u.first_name} ${u.last_name}`]));
  const orgMap = new Map(organizations.map((o) => [o.id, o.name]));
  const requestTitleMap = new Map(requests.map((r) => [r.id, r.title]));

  const sorted = [...logs].sort((a, b) => b.created_at.localeCompare(a.created_at));

  // Group by calendar day
  const groups: { date: string; entries: AuditLog[] }[] = [];
  for (const entry of sorted) {
    const day = entry.created_at.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last?.date === day) {
      last.entries.push(entry);
    } else {
      groups.push({ date: day, entries: [entry] });
    }
  }

  // Action breakdown counts
  const actionCounts: Record<string, number> = {};
  for (const log of logs) {
    actionCounts[log.action] = (actionCounts[log.action] ?? 0) + 1;
  }
  const topActions = Object.entries(actionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <main style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 20px 80px" }}>
      {/* Header */}
      <section style={{ marginBottom: 36 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.24em", textTransform: "uppercase", opacity: 0.6 }}>
          Activity History
        </p>
        <h1 style={{ margin: "10px 0 8px", fontSize: "clamp(2rem, 4vw, 3.4rem)", lineHeight: 1.05 }}>
          Network-wide audit feed.
        </h1>
        <p style={{ margin: 0, maxWidth: 720, opacity: 0.72, lineHeight: 1.55 }}>
          Every significant action across the network — requests created, workers notified, responses
          received, assignments confirmed and cancelled. Read-only, newest first.
        </p>
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 280px",
          gap: 24,
          alignItems: "start",
        }}
      >
        {/* Feed */}
        <div>
          {groups.length === 0 && (
            <p style={{ opacity: 0.5 }}>No activity recorded yet.</p>
          )}
          {groups.map(({ date, entries }) => (
            <div key={date} style={{ marginBottom: 32 }}>
              <div
                style={{
                  fontSize: 12,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  opacity: 0.5,
                  marginBottom: 14,
                  paddingBottom: 8,
                  borderBottom: "1px solid rgba(247,240,223,0.08)",
                }}
              >
                {date}
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                {entries.map((log) => {
                  const m = meta(log.action);
                  const actor = userMap.get(log.actor_user_id) ?? "Unknown";
                  const org = log.organization_id ? orgMap.get(log.organization_id) : null;
                  const ctx = contextLine(log, requestTitleMap);

                  return (
                    <div
                      key={log.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "28px 1fr auto",
                        gap: "0 14px",
                        padding: "14px 16px",
                        borderRadius: 14,
                        background: "rgba(247, 240, 223, 0.04)",
                        border: "1px solid rgba(247, 240, 223, 0.06)",
                        alignItems: "start",
                      }}
                    >
                      {/* Dot */}
                      <div style={{ paddingTop: 3, display: "flex", justifyContent: "center" }}>
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: m.dot,
                            display: "block",
                            flexShrink: 0,
                          }}
                        />
                      </div>

                      {/* Body */}
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              color: m.accent,
                            }}
                          >
                            {m.label}
                          </span>
                          {org && (
                            <span style={{ fontSize: 12, opacity: 0.5 }}>{org}</span>
                          )}
                        </div>

                        {ctx && (
                          <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600, opacity: 0.85 }}>
                            {ctx}
                          </div>
                        )}

                        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.5 }}>
                          by {actor}
                        </div>
                      </div>

                      {/* Time */}
                      <div style={{ fontSize: 12, opacity: 0.45, whiteSpace: "nowrap" }}>
                        {relativeTime(log.created_at)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar: breakdown */}
        <div style={{ position: "sticky", top: 100 }}>
          <div
            style={{
              padding: 20,
              borderRadius: 18,
              background: "rgba(247, 240, 223, 0.06)",
              border: "1px solid rgba(247, 240, 223, 0.1)",
              marginBottom: 16,
            }}
          >
            <h3 style={{ margin: "0 0 16px", fontSize: 15 }}>Action breakdown</h3>
            <div style={{ display: "grid", gap: 10 }}>
              {topActions.map(([action, count]) => {
                const m = meta(action);
                const pct = logs.length ? Math.round((count / logs.length) * 100) : 0;
                return (
                  <div key={action}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: m.accent, fontWeight: 600 }}>{m.label}</span>
                      <span style={{ opacity: 0.6 }}>{count}</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 99, background: "rgba(247,240,223,0.08)" }}>
                      <div
                        style={{
                          height: "100%",
                          borderRadius: 99,
                          width: `${pct}%`,
                          background: m.dot,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            style={{
              padding: 20,
              borderRadius: 18,
              background: "rgba(247, 240, 223, 0.06)",
              border: "1px solid rgba(247, 240, 223, 0.1)",
            }}
          >
            <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Summary</h3>
            <div style={{ display: "grid", gap: 8 }}>
              <StatRow label="Total events" value={logs.length} />
              <StatRow label="Days covered" value={groups.length} />
            </div>
          </div>
        </div>
      </div>

      <p style={{ marginTop: 40, opacity: 0.45, fontSize: 13 }}>
        Staffig oversight surface · read-only · Phase D complete.
      </p>
    </main>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
      <span style={{ opacity: 0.6 }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
