import { PageFrame } from "../../../components/page-frame";
import { Panel } from "../../../components/panel";
import { RequestCreateForm } from "../../../components/request-create-form";
import { RequestWorkflowCard } from "../../../components/request-workflow-card";
import {
  getAssignments,
  getOrganizations,
  getRequestResponses,
  getRequests,
  getUsers,
  getWorkers,
} from "../../../lib/api";

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

  return (
    <PageFrame
      eyebrow="Dispatch Queue"
      title="Requests"
      description="Publish requests, collect worker responses, and confirm assignments without leaving the operations queue."
    >
      <Panel title="Create request" subtitle="New dispatch need">
        <RequestCreateForm organizations={organizations} users={users} />
      </Panel>

      <div style={{ height: 22 }} />

      <Panel title="Request workflow" subtitle={`${requests.length} requests`}>
        <div style={{ display: "grid", gap: 18 }}>
          {requests.map((request) => (
            <RequestWorkflowCard
              key={request.id}
              request={request}
              responses={responseMap.get(request.id) || []}
              users={users}
              workers={workers}
              assignment={assignments.find((assignment) => assignment.staffing_request_id === request.id && assignment.status !== "cancelled") || null}
            />
          ))}
        </div>
      </Panel>
    </PageFrame>
  );
}
