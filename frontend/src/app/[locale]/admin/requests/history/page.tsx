import Link from "next/link";
import { PageFrame } from "../../../../../components/page-frame";
import { Panel } from "../../../../../components/panel";
import { getAssignments, getOrganizations, getRequests, getUsers } from "../../../../../lib/api";
import { Assignment, StaffingRequest, User } from "../../../../../lib/types";

const CLOSED_STATUSES = new Set(["assigned", "completed", "cancelled", "expired"]);

const STATUS_PALETTE: Record<string, { bg: string; color: string }> = {
  assigned:  { bg: "#d2ead8", color: "#1a4a2e" },
  completed: { bg: "#b8dfc3", color: "#1a4a2e" },
  cancelled: { bg: "#f4d4cc", color: "#7a3526" },
  expired:   { bg: "#e8e8e4", color: "#5d5d58" },
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

function workerName(users: User[], userId: string | null | undefined): string | null {
  if (!userId) return null;
  const user = users.find((u) => u.id === userId);
  return user ? `${user.first_name} ${user.last_name}` : null;
}

function outcomeText(
  request: StaffingRequest,
  assignment: Assignment | undefined,
  users: User[],
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
  const [requests, assignments, organizations, users] = await Promise.all([
    getRequests(),
    getAssignments(),
    getOrganizations(),
    getUsers(),
  ]);

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
          style={{ color: "#183229", fontWeight: 800, textDecoration: "none" }}
        >
          ← Back to active requests
        </Link>
      </div>

      <Panel title="Closed requests" subtitle={`${closed.length} records`}>
        {closed.length === 0 ? (
          <p style={{ margin: 0, color: "#5d6d66" }}>No closed requests yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {closed.map((request) => {
              const assignment = assignmentMap.get(request.id);
              const palette = STATUS_PALETTE[request.status] ?? STATUS_PALETTE.expired;
              const outcome = outcomeText(request, assignment, users);
              return (
                <article
                  key={request.id}
                  style={{
                    borderRadius: 18,
                    padding: 18,
                    background: "#fffdf7",
                    border: "1px solid rgba(24, 50, 41, 0.1)",
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                    <div>
                      <Link
                        href={`/admin/requests/${request.id}`}
                        style={{ textDecoration: "none", color: "inherit" }}
                      >
                        <strong style={{ fontSize: 18, lineHeight: 1.2 }}>{request.title}</strong>
                      </Link>
                      <p style={{ margin: "4px 0 0", color: "#496158", fontSize: 13 }}>
                        {orgMap.get(request.organization_id) ?? "Unknown org"} · {request.city} · {request.work_date}
                      </p>
                    </div>
                    <span
                      style={{
                        borderRadius: 999,
                        padding: "4px 12px",
                        background: palette.bg,
                        color: palette.color,
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {request.status}
                    </span>
                  </div>

                  <div style={{ fontSize: 13, color: "#3d564c" }}>
                    {outcome}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 16,
                      fontSize: 12,
                      color: "#6b8179",
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
