import { Link } from "../../../../../i18n/navigation";
import { notFound } from "next/navigation";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { BestMatchCard } from "../../../../../components/best-match-card";
import { PageFrame } from "../../../../../components/page-frame";
import { Panel } from "../../../../../components/panel";
import {
  AssignmentPanel,
  HideWhenClosed,
  RequestHeaderPills,
  LiveBadge,
  RequestLiveProvider,
  ResponseSummaryPanel,
  WorkflowTracker,
} from "../../../../../components/request-live";
// Pure module — request-live is "use client"; a server component may render
// its components but must never *call* a function it exports.
import { isClosedStatus } from "../../../../../lib/request-status";
import { RequestWorkflowCard } from "../../../../../components/request-workflow-card";
import { Mono } from "../../../../../components/ui";
import {
  getAdminSubstitutes,
  getAssignments,
  getOrganizations,
  getRequest,
  getRequestResponses,
  getUsers,
  getWorkers,
} from "../../../../../lib/api";

function formatStatus(value: string) {
  return value.replace(/_/g, " ");
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

  const [users, workers, organizations, assignments, responses, ranked] = await Promise.all([
    getUsers(),
    // Lookup only (assigned worker card, accepted-response rows): keep
    // removed workers so a historical request still resolves its name.
    getWorkers({ includeInactive: true }),
    getOrganizations(),
    getAssignments(),
    getRequestResponses(id),
    getAdminSubstitutes({ rankAgainstRequestId: id }).catch(() => ({ items: [], rank_against: null })),
  ]);

  const organization = organizations.find((item) => item.id === request.organization_id);
  // Pre-assigned requests can still be edited (mirrors backend EDITABLE_STATUSES).
  const isEditable = ["draft", "open", "notified", "responses_received"].includes(request.status);
  // Terminal request (assigned / cancelled / completed / expired): no match
  // or ranking controls — there is nothing left to fill (finding #8).
  const isClosed = isClosedStatus(request.status);
  // "released" (giver handed the shift off via self-serve replacement) is dead
  // like "cancelled" — it must not surface as the current assignee (Finding #1).
  const assignment = assignments.find(
    (item) =>
      item.staffing_request_id === request.id &&
      item.status !== "cancelled" &&
      item.status !== "released",
  ) || null;

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

  // Decline-with-reason callout — show the most recent declined response with a reason, if any.
  const declinedWithReason = responses
    .filter((r) => (r.status === "declined" || r.status === "withdrawn") && r.decline_reason)
    .sort((a, b) => (b.responded_at ?? "").localeCompare(a.responded_at ?? ""))[0];
  const declinedWithReasonWorker = declinedWithReason
    ? users.find((u) => u.id === declinedWithReason.worker_user_id)
    : null;
  const declineCount = responses.filter((r) => r.status === "declined" || r.status === "withdrawn").length;

  return (
    <RequestLiveProvider
      initialRequest={request}
      initialResponses={responses}
      initialAssignments={assignments}
    >
    <PageFrame
      eyebrow="Request Detail"
      title={request.title}
      titleAddon={<LiveBadge />}
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
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <RequestHeaderPills requestId={request.id} initialStatus={request.status} />
        </div>
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

      <WorkflowTracker />

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

          <ResponseSummaryPanel />

          <AssignmentPanel users={users} />
        </div>

        <div style={{ display: "grid", gap: 22 }}>
          {bestMatch && !assignment && !isClosed && !request.auto_assign && bestMatch.match_score !== null ? (
            <HideWhenClosed>
              <BestMatchCard
                worker={bestMatch.worker}
                matchScore={bestMatch.match_score}
                reasons={bestMatch.reasons}
                requestId={request.id}
              />
            </HideWhenClosed>
          ) : null}

          <Panel title="Workflow actions" subtitle="Live controls">
            <RequestWorkflowCard
              request={request}
              responses={responses}
              users={users}
              workers={workers}
              assignment={assignment}
            />
          </Panel>
        </div>
      </section>
    </PageFrame>
    </RequestLiveProvider>
  );
}
