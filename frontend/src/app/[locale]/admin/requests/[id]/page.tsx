import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Circle } from "lucide-react";
import { PageFrame } from "../../../../../components/page-frame";
import { Panel } from "../../../../../components/panel";
import { RequestWorkflowCard } from "../../../../../components/request-workflow-card";
import { Eyebrow, Mono } from "../../../../../components/ui";
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

// 5-step workflow per HANDOFF spec: Created → Notified → Responses → Assign → Confirmed
type StepState = "done" | "current" | "pending";

function workflowSteps(status: string, hasResponses: boolean, hasAssignment: boolean) {
  const steps: { label: string; state: StepState }[] = [
    { label: "Created",  state: "pending" },
    { label: "Notified", state: "pending" },
    { label: "Responses", state: "pending" },
    { label: "Assign",   state: "pending" },
    { label: "Confirmed", state: "pending" },
  ];
  // Always done since the request exists
  steps[0].state = "done";

  if (status === "draft") {
    steps[1].state = "current";
    return steps;
  }
  // From notified onwards, step 1 is done
  steps[1].state = "done";

  if (status === "open" || status === "notified") {
    steps[2].state = hasResponses ? "current" : "current";
    return steps;
  }
  if (hasResponses) steps[2].state = "done";

  if (status === "responses_received") {
    steps[3].state = "current";
    return steps;
  }

  if (status === "assigned" || hasAssignment) {
    steps[3].state = "done";
    steps[4].state = status === "completed" ? "done" : "current";
    return steps;
  }
  if (status === "completed") {
    steps[2].state = "done";
    steps[3].state = "done";
    steps[4].state = "done";
    return steps;
  }
  if (status === "cancelled" || status === "expired") {
    return steps;
  }
  return steps;
}

const STATUS_ORDER = ["accepted", "viewed", "notified", "declined", "no_response", "withdrawn"];

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
  const sortedResponses = [...responses].sort((a, b) => {
    return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
  });
  const steps = workflowSteps(request.status, responses.length > 0, assignment != null);

  return (
    <PageFrame
      eyebrow="Request Detail"
      title={request.title}
      description="Inspect one coverage request, its matching context, response board, and assignment state."
    >
      <div style={{ marginBottom: 22 }}>
        <Link
          href="/admin/requests"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--ink-2)",
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          <ArrowLeft size={14} />
          Back to request queue
        </Link>
      </div>

      {/* 5-step horizontal workflow tracker */}
      <section
        style={{
          background: "var(--card)",
          border: "0.5px solid var(--line)",
          borderRadius: 18,
          padding: 22,
          marginBottom: 22,
        }}
      >
        <Eyebrow style={{ marginBottom: 16 }}>Workflow</Eyebrow>
        <ol
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gridTemplateColumns: `repeat(${steps.length}, 1fr)`,
            gap: 0,
          }}
        >
          {steps.map((step, i) => {
            const isLast = i === steps.length - 1;
            const colors =
              step.state === "done"
                ? { ring: "var(--moss)", fill: "var(--moss)", icon: "#fff", text: "var(--ink)" }
                : step.state === "current"
                  ? { ring: "var(--terra)", fill: "var(--terra-soft)", icon: "var(--terra)", text: "var(--ink)" }
                  : { ring: "var(--line)", fill: "transparent", icon: "var(--ink-4)", text: "var(--ink-3)" };
            return (
              <li key={step.label} style={{ position: "relative", textAlign: "center" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  {/* connector line left */}
                  {i > 0 && (
                    <div style={{
                      position: "absolute",
                      left: 0,
                      right: "50%",
                      top: 11,
                      height: 1,
                      background: steps[i - 1].state === "done" ? "var(--moss)" : "var(--line)",
                    }} />
                  )}
                  {/* connector line right */}
                  {!isLast && (
                    <div style={{
                      position: "absolute",
                      left: "50%",
                      right: 0,
                      top: 11,
                      height: 1,
                      background: step.state === "done" ? "var(--moss)" : "var(--line)",
                    }} />
                  )}
                  {/* node */}
                  <div style={{
                    width: 22,
                    height: 22,
                    borderRadius: 99,
                    border: `1.5px solid ${colors.ring}`,
                    background: colors.fill,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: colors.icon,
                    position: "relative",
                    zIndex: 1,
                  }}>
                    {step.state === "done"
                      ? <Check size={12} strokeWidth={2.5} />
                      : step.state === "current"
                        ? <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--terra)" }} />
                        : <Circle size={6} strokeWidth={0} fill="var(--ink-4)" />}
                  </div>
                </div>
                <div style={{ marginTop: 10, fontSize: 12, fontWeight: step.state === "current" ? 600 : 500, color: colors.text }}>
                  {step.label}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

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
            <div style={{ display: "grid", gap: 10, color: "var(--ink-2)", fontSize: 13 }}>
              <p style={{ margin: 0, lineHeight: 1.55 }}>
                {request.description || "No additional notes have been added."}
              </p>
              <div style={{ display: "grid", gap: 6 }}>
                <span>
                  <strong style={{ color: "var(--ink)" }}>Organization:</strong> {organization?.name || "Unknown organization"}
                </span>
                <span>
                  <strong style={{ color: "var(--ink)" }}>Location:</strong> {request.location_name || "No room listed"}, {request.city}
                </span>
                <span>
                  <strong style={{ color: "var(--ink)" }}>Date:</strong> {request.work_date}
                </span>
                <span>
                  <strong style={{ color: "var(--ink)" }}>Time:</strong> <Mono style={{ fontSize: 13 }}>{request.start_time.slice(0, 5)} – {request.end_time.slice(0, 5)}</Mono>
                </span>
                <span>
                  <strong style={{ color: "var(--ink)" }}>Language:</strong> {request.language_requirement || "None"}
                </span>
                <span>
                  <strong style={{ color: "var(--ink)" }}>Urgency:</strong> {request.urgency_level}
                </span>
              </div>
            </div>
          </Panel>

          <Panel title="Requirements">
            <div style={{ display: "grid", gap: 8, color: "var(--ink-2)", fontSize: 13 }}>
              <span>
                <strong style={{ color: "var(--ink)" }}>Qualifications:</strong> {request.required_qualifications.join(", ") || "None"}
              </span>
              <span>
                <strong style={{ color: "var(--ink)" }}>Certifications:</strong> {request.required_certifications?.join(", ") || "None"}
              </span>
              <span>
                <strong style={{ color: "var(--ink)" }}>Request type:</strong> {formatStatus(request.request_type)}
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
                    borderRadius: 12,
                    padding: 14,
                    background: "var(--paper-2)",
                    border: "0.5px solid var(--line)",
                  }}
                >
                  <Eyebrow style={{ marginBottom: 6 }}>{stat.label}</Eyebrow>
                  <Mono style={{ fontSize: 26, fontWeight: 500, color: "var(--ink)" }}>
                    {stat.value}
                  </Mono>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Assignment">
            {assignment ? (
              <div style={{ display: "grid", gap: 6, color: "var(--ink-2)", fontSize: 13 }}>
                <span>
                  <strong style={{ color: "var(--ink)" }}>Substitute:</strong> {assignedWorker}
                </span>
                <span>
                  <strong style={{ color: "var(--ink)" }}>Status:</strong> {formatStatus(assignment.status)}
                </span>
                <span>
                  <strong style={{ color: "var(--ink)" }}>Assigned at:</strong> {assignment.assigned_at.slice(0, 16).replace("T", " ")}
                </span>
                <span>
                  <strong style={{ color: "var(--ink)" }}>Notes:</strong> {assignment.notes || "None"}
                </span>
              </div>
            ) : (
              <p style={{ margin: 0, color: "var(--ink-3)", fontSize: 13 }}>
                No assignment has been confirmed for this request yet.
              </p>
            )}
          </Panel>
        </div>

        <Panel title="Workflow actions" subtitle="Live controls">
          <RequestWorkflowCard
            request={request}
            responses={sortedResponses}
            users={users}
            workers={workers}
            assignment={assignment}
          />
        </Panel>
      </section>
    </PageFrame>
  );
}
