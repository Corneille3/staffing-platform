import Link from "next/link";
import { PageFrame } from "../../../../components/page-frame";
import { Panel } from "../../../../components/panel";
import { RequestWorkflowCard } from "../../../../components/request-workflow-card";
import {
  getAssignments,
  getOrganizations,
  getRequestResponses,
  getRequests,
  getUsers,
  getWorkers,
} from "../../../../lib/api";

export default async function RequestsPage() {
  const [requests, users, workers, organizations, assignments] = await Promise.all([
    getRequests(),
    getUsers(),
    getWorkers(),
    getOrganizations(),
    getAssignments(),
  ]);
  const responsesByRequest = await Promise.all(
    requests.map(async (request) => ({
      requestId: request.id,
      responses: await getRequestResponses(request.id),
    })),
  );

  const responseMap = new Map(responsesByRequest.map((entry) => [entry.requestId, entry.responses]));

  const ACTIVE_STATUSES = new Set(["draft", "open", "notified", "responses_received"]);
  const active = [...requests]
    .filter((r) => ACTIVE_STATUSES.has(r.status))
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const closedCount = requests.filter((r) => !ACTIVE_STATUSES.has(r.status)).length;

  return (
    <PageFrame
      eyebrow="Dispatch Queue"
      title="Requests"
      description="Publish requests, collect substitute responses, and confirm assignments without leaving the operations queue."
    >
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 22 }}>
        <Link
          href="/admin/requests/new"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 18px",
            borderRadius: 999,
            background: "var(--ink)",
            color: "var(--paper)",
            fontSize: 14,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          + New request
        </Link>
      </div>

      <Panel
        title="Active requests"
        subtitle={`${active.length} in progress`}
      >
        <div style={{ display: "grid", gap: 14 }}>
          {active.length === 0 ? (
            <p style={{ margin: 0, color: "var(--ink-3)", fontSize: 13 }}>
              No active requests yet — <Link href="/admin/requests/new" style={{ color: "var(--terra)", textDecoration: "none" }}>create one →</Link>
            </p>
          ) : (
            active.map((request) => (
              <RequestWorkflowCard
                key={request.id}
                request={request}
                responses={responseMap.get(request.id) || []}
                users={users}
                workers={workers}
                assignment={assignments.find((a) => a.staffing_request_id === request.id && a.status !== "cancelled") || null}
              />
            ))
          )}
        </div>
        {closedCount > 0 ? (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "0.5px solid var(--line)" }}>
            <Link
              href="/admin/requests/history"
              style={{ color: "var(--terra)", fontWeight: 500, textDecoration: "none", fontSize: 13 }}
            >
              View coverage history ({closedCount} closed) →
            </Link>
          </div>
        ) : null}
      </Panel>
    </PageFrame>
  );
}
