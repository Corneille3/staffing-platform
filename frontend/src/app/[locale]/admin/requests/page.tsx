import Link from "next/link";
import { PageFrame } from "../../../../components/page-frame";
import { Panel } from "../../../../components/panel";
import { RequestCreateForm } from "../../../../components/request-create-form";
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
      <Panel title="Create request" subtitle="New coverage need">
        <RequestCreateForm organizations={organizations} />
      </Panel>

      <div style={{ height: 22 }} />

      <Panel
        title="Active requests"
        subtitle={`${active.length} in progress`}
      >
        <div style={{ display: "grid", gap: 18 }}>
          {active.length === 0 ? (
            <p style={{ margin: 0, color: "#5d6d66" }}>No active requests right now.</p>
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
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(24, 50, 41, 0.1)" }}>
            <Link
              href="/admin/requests/history"
              style={{ color: "#183229", fontWeight: 800, textDecoration: "none", fontSize: 14 }}
            >
              View coverage history ({closedCount} closed) →
            </Link>
          </div>
        ) : null}
      </Panel>
    </PageFrame>
  );
}
