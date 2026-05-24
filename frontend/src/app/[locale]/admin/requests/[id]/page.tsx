import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Circle, TriangleAlert } from "lucide-react";
import { BestMatchCard } from "../../../../../components/best-match-card";
import { PageFrame } from "../../../../../components/page-frame";
import { Panel } from "../../../../../components/panel";
import { RequestWorkflowCard } from "../../../../../components/request-workflow-card";
import { Eyebrow, Mono } from "../../../../../components/ui";
import {
  getAdminSubstitutes,
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

function workflowSteps(
  status: string,
  hasResponses: boolean,
  hasAssignment: boolean,
  assignmentConfirmed: boolean,
) {
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
    // Assignment is created already CONFIRMED (assign === confirm in this
    // system), so "Confirmed" greens the moment a worker is assigned — not
    // only once the shift is completed.
    steps[4].state = assignmentConfirmed || status === "completed" ? "done" : "current";
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

  const [users, workers, organizations, assignments, responses, ranked] = await Promise.all([
    getUsers(),
    getWorkers(),
    getOrganizations(),
    getAssignments(),
    getRequestResponses(id),
    getAdminSubstitutes({ rankAgainstRequestId: id }).catch(() => ({ items: [], rank_against: null })),
  ]);

  const organization = organizations.find((item) => item.id === request.organization_id);
  const assignment = assignments.find((item) => item.staffing_request_id === request.id && item.status !== "cancelled") || null;
  const assignedWorker = assignment ? formatWorkerName(users, assignment.worker_user_id) : null;
  const counts = responseCounts(responses);
  const viewedCount = responses.filter((r) => r.viewed_at != null).length;
  const sortedResponses = [...responses].sort((a, b) => {
    return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
  });
  const steps = workflowSteps(
    request.status,
    responses.length > 0,
    assignment != null,
    assignment?.status === "confirmed" || assignment?.status === "completed",
  );

  // Best match = highest-score scored row whose response (if any) isn't declined/withdrawn,
  // and who isn't already the assigned worker. Prefer accepted responders first.
  const responseByWorker = new Map(responses.map((r) => [r.worker_user_id, r]));
  const RESPONSE_PRIORITY: Record<string, number> = {
    accepted: 0,
    viewed: 1,
    notified: 2,
    no_response: 3,
    declined: 99,
    withdrawn: 99,
  };
  const eligibleScoredRows = ranked.items
    .filter((row) => row.eligible !== false)
    .filter((row) => row.worker.id !== assignment?.worker_user_id)
    .filter((row) => {
      const resp = responseByWorker.get(row.worker.id);
      return !resp || (resp.status !== "declined" && resp.status !== "withdrawn");
    })
    .sort((a, b) => {
      const ra = responseByWorker.get(a.worker.id);
      const rb = responseByWorker.get(b.worker.id);
      const pa = ra ? RESPONSE_PRIORITY[ra.status] ?? 50 : 50;
      const pb = rb ? RESPONSE_PRIORITY[rb.status] ?? 50 : 50;
      if (pa !== pb) return pa - pb;
      return (b.match_score ?? 0) - (a.match_score ?? 0);
    });
  const bestMatch = eligibleScoredRows[0] ?? null;

  // First admin in the response set drives the "assigned_by" id when we assign from the card.
  const orgAdminUser = users.find((u) => u.role === "org_admin") || users.find((u) => u.role === "network_admin") || null;

  // Decline-with-reason callout — show the most recent declined response with a reason, if any.
  const declinedWithReason = responses
    .filter((r) => (r.status === "declined" || r.status === "withdrawn") && r.decline_reason)
    .sort((a, b) => (b.responded_at ?? "").localeCompare(a.responded_at ?? ""))[0];
  const declinedWithReasonWorker = declinedWithReason
    ? users.find((u) => u.id === declinedWithReason.worker_user_id)
    : null;
  const declineCount = responses.filter((r) => r.status === "declined" || r.status === "withdrawn").length;

  return (
    <PageFrame
      eyebrow="Request Detail"
      title={request.title}
      description="Inspect one coverage request, its matching context, response board, and assignment state."
    >
      <div style={{ marginBottom: 22, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
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
        <Link
          href={`/admin/substitutes?rank_against_request_id=${request.id}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 14px",
            borderRadius: 999,
            background: "transparent",
            border: "0.5px solid var(--line)",
            color: "var(--ink)",
            fontSize: 13,
            fontWeight: 500,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Rank substitutes →
        </Link>
      </div>

      {declinedWithReason && declinedWithReasonWorker ? (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "12px 14px",
            borderRadius: "var(--r-md)",
            background: "var(--sand-soft)",
            border: "0.5px solid var(--sand)",
            color: "#7C5C12",
            fontSize: 13,
            lineHeight: 1.45,
            marginBottom: 22,
          }}
        >
          <TriangleAlert size={18} strokeWidth={1.6} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong style={{ fontWeight: 600 }}>
              {declinedWithReasonWorker.first_name} {declinedWithReasonWorker.last_name}
            </strong>{" "}
            declined: &ldquo;{declinedWithReason.decline_reason}.&rdquo;
            {declineCount > 1 ? ` ${declineCount} declines on this request so far.` : ""}
          </div>
        </div>
      ) : null}

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

        <div style={{ display: "grid", gap: 22 }}>
          {bestMatch && !assignment && bestMatch.match_score !== null ? (
            <BestMatchCard
              worker={bestMatch.worker}
              matchScore={bestMatch.match_score}
              reasons={bestMatch.reasons}
              requestId={request.id}
              orgAdminUserId={orgAdminUser?.id ?? null}
            />
          ) : null}

          <Panel title="Workflow actions" subtitle="Live controls">
            <RequestWorkflowCard
              request={request}
              responses={sortedResponses}
              users={users}
              workers={workers}
              assignment={assignment}
            />
          </Panel>
        </div>
      </section>
    </PageFrame>
  );
}
