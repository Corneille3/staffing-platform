import Link from "next/link";
import { notFound } from "next/navigation";
import { PageFrame } from "../../../../../components/page-frame";
import { Panel } from "../../../../../components/panel";
import { RequestWorkflowCard } from "../../../../../components/request-workflow-card";
import {
  getAssignments,
  getOrganizations,
  getRequest,
  getRequestResponses,
  getUsers,
  getWorkers,
} from "../../../../../lib/api";
import { RequestResponse, User } from "../../../../../lib/types";

function formatStatus(value: string) {
  return value.replace(/_/g, " ");
}

function formatWorkerName(users: User[], workerUserId: string) {
  const worker = users.find((user) => user.id === workerUserId);
  return worker ? `${worker.first_name} ${worker.last_name}` : "Unknown worker";
}

function responseCounts(responses: RequestResponse[]) {
  return responses.reduce(
    (counts, response) => ({
      ...counts,
      [response.status]: (counts[response.status] || 0) + 1,
    }),
    {} as Record<string, number>,
  );
}

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let request;
  try {
    request = await getRequest(id);
  } catch {
    notFound();
  }

  const [users, workers, organizations, assignments, responses] = await Promise.all([
    getUsers(),
    getWorkers(),
    getOrganizations(),
    getAssignments(),
    getRequestResponses(id),
  ]);

  const organization = organizations.find((item) => item.id === request.organization_id);
  const assignment = assignments.find((item) => item.staffing_request_id === request.id && item.status !== "cancelled") || null;
  const assignedWorker = assignment ? formatWorkerName(users, assignment.worker_user_id) : null;
  const counts = responseCounts(responses);
  const viewedCount = responses.filter((r) => r.viewed_at != null).length;

  return (
    <PageFrame
      eyebrow="Request Detail"
      title={request.title}
      description="Inspect one coverage request, its matching context, response board, and assignment state."
    >
      <div style={{ marginBottom: 18 }}>
        <Link
          href="/admin/requests"
          style={{
            color: "#183229",
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          Back to request queue
        </Link>
      </div>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 1.1fr)",
          gap: 22,
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: 22 }}>
          <Panel title="Request brief" subtitle={formatStatus(request.status)}>
            <div style={{ display: "grid", gap: 12, color: "#314c42" }}>
              <p style={{ margin: 0, lineHeight: 1.55 }}>
                {request.description || "No additional notes have been added."}
              </p>
              <div style={{ display: "grid", gap: 8 }}>
                <span>
                  <strong>Organization:</strong> {organization?.name || "Unknown organization"}
                </span>
                <span>
                  <strong>Location:</strong> {request.location_name || "No room listed"}, {request.city}
                </span>
                <span>
                  <strong>Date:</strong> {request.work_date}
                </span>
                <span>
                  <strong>Time:</strong> {request.start_time.slice(0, 5)} - {request.end_time.slice(0, 5)}
                </span>
                <span>
                  <strong>Language:</strong> {request.language_requirement || "None"}
                </span>
                <span>
                  <strong>Urgency:</strong> {request.urgency_level}
                </span>
              </div>
            </div>
          </Panel>

          <Panel title="Requirements">
            <div style={{ display: "grid", gap: 12, color: "#314c42" }}>
              <span>
                <strong>Qualifications:</strong> {request.required_qualifications.join(", ") || "None"}
              </span>
              <span>
                <strong>Certifications:</strong> {request.required_certifications?.join(", ") || "None"}
              </span>
              <span>
                <strong>Request type:</strong> {formatStatus(request.request_type)}
              </span>
            </div>
          </Panel>

          <Panel title="Response summary" subtitle={`${responses.length} records`}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                gap: 10,
              }}
            >
              {[
                { label: "Notified", value: counts.notified || 0 },
                { label: "Opened", value: viewedCount },
                { label: "Accepted", value: counts.accepted || 0 },
                { label: "Declined", value: counts.declined || 0 },
              ].map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    borderRadius: 14,
                    padding: 14,
                    background: "#fffdf7",
                    border: "1px solid rgba(24, 50, 41, 0.1)",
                  }}
                >
                  <div style={{ color: "#5d6d66", fontSize: 13, fontWeight: 800 }}>
                    {stat.label}
                  </div>
                  <strong style={{ display: "block", marginTop: 4, fontSize: 28 }}>
                    {stat.value}
                  </strong>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Assignment">
            {assignment ? (
              <div style={{ display: "grid", gap: 8, color: "#314c42" }}>
                <span>
                  <strong>Substitute:</strong> {assignedWorker}
                </span>
                <span>
                  <strong>Status:</strong> {formatStatus(assignment.status)}
                </span>
                <span>
                  <strong>Assigned at:</strong> {assignment.assigned_at.slice(0, 16).replace("T", " ")}
                </span>
                <span>
                  <strong>Notes:</strong> {assignment.notes || "None"}
                </span>
              </div>
            ) : (
              <p style={{ margin: 0, color: "#5d6d66" }}>
                No assignment has been confirmed for this request yet.
              </p>
            )}
          </Panel>
        </div>

        <Panel title="Workflow actions" subtitle="Live controls">
          <RequestWorkflowCard
            request={request}
            responses={responses}
            users={users}
            workers={workers}
            assignment={assignment}
          />
        </Panel>
      </section>
    </PageFrame>
  );
}
