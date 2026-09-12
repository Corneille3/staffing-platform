import Link from "next/link";
import { PageFrame } from "../../../../../components/page-frame";
import { Panel } from "../../../../../components/panel";
import { getAssignments, getOrganizations, getRequests, getUsers, getWorkers } from "../../../../../lib/api";
import { Assignment, StaffingRequest } from "../../../../../lib/types";

const CLOSED_STATUSES = new Set(["assigned", "completed", "cancelled", "expired"]);

const STATUS_PALETTE: Record<string, { bg: string; color: string }> = {
  assigned:  { bg: "var(--moss-soft)", color: "var(--moss)" },
  completed: { bg: "var(--moss-soft)", color: "var(--moss)" },
  cancelled: { bg: "var(--rose-soft)", color: "var(--rose)" },
  expired:   { bg: "var(--paper-2)",   color: "var(--ink-3)" },
};

function timeDiff(from: string, to: string): string {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "< 1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const hrs = hours % 24;
  return hrs > 0 ? `${days}d ${hrs}h` : `${days}d`;
}

type Named = { id: string; first_name: string; last_name: string };

function workerName(people: Named[], userId: string | null | undefined): string | null {
  if (!userId) return null;
  const person = people.find((u) => u.id === userId);
  return person ? `${person.first_name} ${person.last_name}` : null;
}

function outcomeText(
  request: StaffingRequest,
  assignment: Assignment | undefined,
  users: Named[],
): string {
  if (request.status === "cancelled") {
    const duration = request.cancelled_at
      ? timeDiff(request.created_at ?? request.work_date, request.cancelled_at)
      : null;
    return duration ? `Cancelled after ${duration}` : "Cancelled";
  }
  if (request.status === "expired") return "Expired — no assignment made";
  if (assignment) {
    const name = workerName(users, assignment.worker_user_id);
    const fill = request.created_at && assignment.assigned_at
      ? timeDiff(request.created_at, assignment.assigned_at)
      : null;
    const parts = [];
    if (name) parts.push(name);
    if (fill) parts.push(`filled in ${fill}`);
    return parts.join(" · ") || "Assigned";
  }
  return "Completed";
}

export default async function CoverageHistoryPage() {
  const [requests, assignments, organizations, activeUsers, workersIncludingRemoved] = await Promise.all([
    getRequests(),
    getAssignments(),
    getOrganizations(),
    getUsers(),
    // History must still name a substitute who has since been removed —
    // `users` only carries active memberships.
    getWorkers({ includeInactive: true }),
  ]);
  const users: Named[] = [...activeUsers, ...workersIncludingRemoved];

  const closed = [...requests]
    .filter((r) => CLOSED_STATUSES.has(r.status))
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

  const assignmentMap = new Map(assignments.map((a) => [a.staffing_request_id, a]));
  const orgMap = new Map(organizations.map((o) => [o.id, o.name]));

  return (
    <PageFrame
      eyebrow="Requests"
      title="Coverage history"
      description="Past, completed, and cancelled coverage requests with outcomes and time-to-fill."
    >
      <div style={{ marginBottom: 18 }}>
        <Link
          href="/admin/requests"
          style={{ color: "var(--ink-2)", fontSize: 13, textDecoration: "none" }}
        >
          ← Back to active requests
        </Link>
      </div>

      <Panel title="Closed requests" subtitle={`${closed.length} records`}>
        {closed.length === 0 ? (
          <p style={{ margin: 0, color: "var(--ink-3)", fontSize: 13 }}>No closed requests yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {closed.map((request) => {
              const assignment = assignmentMap.get(request.id);
              const palette = STATUS_PALETTE[request.status] ?? STATUS_PALETTE.expired;
              const outcome = outcomeText(request, assignment, users);
              return (
                <article
                  key={request.id}
                  style={{
                    borderRadius: 14,
                    padding: 16,
                    background: "var(--paper-2)",
                    border: "0.5px solid var(--line)",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                    <div>
                      <Link
                        href={`/admin/requests/${request.id}`}
                        style={{ textDecoration: "none", color: "inherit" }}
                      >
                        <strong style={{ fontFamily: "var(--serif)", fontSize: 17, lineHeight: 1.2, fontWeight: 400 }}>
                          {request.title}
                        </strong>
                      </Link>
                      <p style={{ margin: "4px 0 0", color: "var(--ink-3)", fontSize: 12 }}>
                        {orgMap.get(request.organization_id) ?? "Unknown org"} · {request.city} · {request.work_date}
                      </p>
                    </div>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        borderRadius: 999,
                        padding: "4px 10px",
                        background: palette.bg,
                        color: palette.color,
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: "0.03em",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {request.status}
                    </span>
                  </div>

                  <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
                    {outcome}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 14,
                      fontSize: 12,
                      color: "var(--ink-3)",
                    }}
                  >
                    <span>{request.start_time.slice(0, 5)} – {request.end_time.slice(0, 5)}</span>
                    {request.language_requirement ? <span>{request.language_requirement.toUpperCase()}</span> : null}
                    {request.created_at ? (
                      <span>Created {request.created_at.slice(0, 10)}</span>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>
    </PageFrame>
  );
}
