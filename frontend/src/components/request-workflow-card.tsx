"use client";

import { Link } from "../i18n/navigation";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { errorMessageFromResponse } from "../lib/browser-api";
import { useCredentialLabel } from "../hooks/use-credential-label";
import { isClosedStatus, LIVE_STATUSES, useRequestLive } from "./request-live";
import { useReadOnlyVisit } from "./read-only-visit";
import { Eyebrow } from "./ui";
import { Assignment, RequestResponse, StaffingRequest, User, Worker } from "../lib/types";
import { shiftDateTime, shiftTime } from "../lib/shift-time";

const browserApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
type ClerkLike = { session?: { getToken: () => Promise<string | null> } };

function formatStatus(value: string) {
  return value.replace(/_/g, " ");
}

/** Wording shared by the card and its sub-cards, from `admin.*`. Every label
 * falls back to the raw value, so an unknown status or code still shows. */
function useDetailLabels() {
  const a = useTranslations("admin");
  const credential = useCredentialLabel();
  const lookup = (key: string, raw: string) => (a.has(key) ? a(key) : formatStatus(raw));
  return {
    requestStatus: (status: string) => lookup(`status.${status}`, status),
    assignmentStatus: (status: string) => lookup(`detail.assignmentStatus.${status}`, status),
    // What actually happened on the shift, when the clock knows better than
    // the raw status ("confirmed" forever on a missed shift).
    attendance: (assignment: Assignment) =>
      assignment.attendance && a.has(`detail.attendance.${assignment.attendance}`)
        ? a(`detail.attendance.${assignment.attendance}`)
        : lookup(`detail.assignmentStatus.${assignment.status}`, assignment.status),
    language: (code: string | null | undefined, none: string) =>
      code ? (a.has(`languageNames.${code}`) ? a(`languageNames.${code}`) : code) : none,
    credentials: (codes: string[] | null | undefined, none: string) =>
      (codes ?? []).map(credential).join(", ") || none,
    availability: (status: string) => lookup(`detail.card.${status}`, status),
    coverage: (value: string) => lookup(`form.coverage.${value}.label`, value),
  };
}

const RESPONSE_PALETTE: Record<string, { bg: string; chip: string; chipColor: string }> = {
  notified:    { bg: "var(--paper-2)",  chip: "var(--sand-soft)",  chipColor: "#8C6B14" },
  viewed:      { bg: "var(--paper-2)",  chip: "var(--sand-soft)",  chipColor: "#8C6B14" },
  accepted:    { bg: "var(--moss-soft)", chip: "var(--moss)",      chipColor: "#FFFFFF" },
  declined:    { bg: "var(--rose-soft)", chip: "var(--rose-soft)", chipColor: "var(--rose)" },
  no_response: { bg: "var(--paper-2)",  chip: "var(--line)",       chipColor: "var(--ink-3)" },
  withdrawn:   { bg: "var(--paper-2)",  chip: "var(--line)",       chipColor: "var(--ink-3)" },
};

// `value` is what the API stores (kept in English, as before); `key` names
// the label under admin.detail.card.cancelReasons.
const ASSIGNMENT_CANCELLATION_REASONS = [
  { value: "Substitute unavailable", key: "unavailable" },
  { value: "Coordinator changed plan", key: "plan" },
  { value: "Request no longer needed", key: "notNeeded" },
  { value: "Other", key: "other" },
];

const STATUS_ORDER = ["accepted", "viewed", "notified", "declined", "no_response", "withdrawn"];

function sortResponses(responses: RequestResponse[]): RequestResponse[] {
  return [...responses].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
}

export function RequestWorkflowCard({
  request: initialRequest,
  responses: initialResponses,
  users,
  workers,
  assignment: initialAssignment,
}: {
  request: StaffingRequest;
  responses: RequestResponse[];
  users: User[];
  workers: Worker[];
  assignment: Assignment | null;
}) {
  const router = useRouter();
  // Inside a RequestLiveProvider the polled snapshot wins over the
  // server-rendered props; elsewhere the props are the whole story.
  const live = useRequestLive();
  // Read-only access-grant visit: everything stays readable, no action buttons.
  const readOnlyVisit = useReadOnlyVisit();
  const request = live?.request ?? initialRequest;
  const responses = sortResponses(live?.responses ?? initialResponses);
  const assignment = live ? live.assignment : initialAssignment;
  const t = useTranslations("admin.live");
  const c = useTranslations("admin.detail.card");
  const labels = useDetailLabels();
  const [isPending, startTransition] = useTransition();
  // Rows present on first render don't animate; anything that shows up on a
  // later poll fades in. Never reset, so a row only ever animates once.
  const seenResponseIds = useRef<Set<string> | null>(null);
  if (seenResponseIds.current === null) seenResponseIds.current = new Set(responses.map((r) => r.id));
  const newResponseIds = new Set<string>();
  for (const r of responses) {
    if (!seenResponseIds.current.has(r.id)) {
      newResponseIds.add(r.id);
      seenResponseIds.current.add(r.id);
    }
  }
  // Set the moment a button is clicked — the fetch itself is the slow part
  // (the backend fans out email/SMS/push synchronously), and isPending only
  // covers the router.refresh() afterwards. Without this the button looks
  // dead for seconds and repeat clicks fire duplicate notifications.
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelAssignmentOpen, setCancelAssignmentOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState(ASSIGNMENT_CANCELLATION_REASONS[0].value);
  const [cancelNotes, setCancelNotes] = useState("");

  const workerUsers = users.filter((user) => user.role === "worker");
  const acceptedResponses = responses.filter((response) => response.status === "accepted");
  // `users` only lists people with an active membership; `workers` comes with
  // removed accounts included (the page opts in) so a historical request still
  // names a substitute who has since been removed.
  const personById = (id: string | null | undefined) =>
    (id && (users.find((u) => u.id === id) ?? workers.find((w) => w.id === id))) || null;
  const assignedWorker = personById(request.assigned_worker_user_id) ?? personById(assignment?.worker_user_id);
  const assignedWorkerProfile = workers.find((worker) => worker.id === assignment?.worker_user_id) || null;
  const isClosed = isClosedStatus(request.status);
  // First come, first served: the first eligible claim wins on its own, so
  // accept/decline and the review-and-assign cards would only mislead.
  const firstClaim = request.auto_assign === true;

  const working = busyAction !== null || isPending;

  async function post(path: string, payload?: object, method: "POST" | "PATCH" = "POST") {
    if (working) return;
    setError(null);
    setBusyAction(path);
    try {
      let token: string | null = null;
      if (CLERK_ENABLED && typeof window !== "undefined") {
        token = (await (window as unknown as { Clerk?: ClerkLike }).Clerk?.session?.getToken()) ?? null;
      }
      const response = await fetch(`${browserApiBaseUrl}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: payload ? JSON.stringify(payload) : undefined,
      });

      if (!response.ok) {
        setError(await errorMessageFromResponse(response, c("actionFailed", { status: response.status })));
        return;
      }

      // Pull the live snapshot right away (the poll would catch it within
      // one tick anyway); router.refresh() still re-renders the server-side
      // bits such as the Best-match card.
      live?.refresh();
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError(c("networkError"));
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <article
      style={{
        borderRadius: 18,
        padding: 22,
        background: "var(--card)",
        border: "0.5px solid var(--line)",
        display: "grid",
        gap: 18,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 24, lineHeight: 1.1, fontWeight: 400 }}>
            {request.title}
          </h2>
          <p style={{ margin: "8px 0 0", color: "var(--ink-2)", fontSize: 13 }}>
            {request.city} · {request.work_date} · {request.start_time.slice(0, 5)} – {request.end_time.slice(0, 5)}
          </p>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            borderRadius: 999,
            padding: "5px 11px",
            background: request.status === "assigned" ? "var(--moss-soft)" : "var(--sand-soft)",
            color: request.status === "assigned" ? "var(--moss)" : "#8C6B14",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
          }}
        >
          {labels.requestStatus(request.status)}
        </span>
      </div>

      <div style={{ color: "var(--ink-2)", display: "grid", gap: 6, fontSize: 13, lineHeight: 1.5 }}>
        <span>{request.description || c("noNotes")}</span>
        <span>
          {request.coverage_type ? `${labels.coverage(request.coverage_type)} · ` : ""}
          {c("metaLine", {
            language: labels.language(request.language_requirement, c("none")),
            urgency: request.urgency_level,
          })}
        </span>
        <span>{c("requiredQualifications", { list: labels.credentials(request.required_qualifications, c("none")) })}</span>
        <span>{c("requiredCertifications", { list: labels.credentials(request.required_certifications, c("none")) })}</span>
        {assignedWorker ? (
          <span>
            {c.rich("assignedTo", {
              name: `${assignedWorker.first_name} ${assignedWorker.last_name}`,
              b: (chunks) => <strong style={{ color: "var(--ink)" }}>{chunks}</strong>,
            })}
            {assignment ? ` · ${labels.attendance(assignment)}` : ""}
          </span>
        ) : null}
      </div>

      {firstClaim && !isClosed ? (
        <p
          style={{
            margin: 0,
            padding: "10px 14px",
            borderRadius: 12,
            background: "var(--moss-soft)",
            border: "0.5px solid #C8DCC1",
            color: "var(--ink-2)",
            fontSize: 13,
          }}
        >
          {c("fcfs")}
        </p>
      ) : null}

      {request.status === "cancelled" ? (
        <p
          style={{
            margin: 0,
            padding: "10px 14px",
            borderRadius: 12,
            background: "var(--sand-soft)",
            border: "0.5px solid var(--sand)",
            color: "var(--ink-2)",
            fontSize: 13,
          }}
        >
          {request.cancelled_at
            ? c("cancelledOn", { date: shiftDateTime(request.cancelled_at) })
            : c("cancelled")}
        </p>
      ) : null}

      {request.status === "expired" ? (
        <p
          style={{
            margin: 0,
            padding: "10px 14px",
            borderRadius: 12,
            background: "var(--sand-soft)",
            border: "0.5px solid var(--sand)",
            color: "var(--ink-2)",
            fontSize: 13,
          }}
        >
          {c("expired")}
        </p>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Link
          href={`/admin/requests/${request.id}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            borderRadius: 12,
            padding: "10px 16px",
            background: "var(--card)",
            border: "0.5px solid var(--line)",
            color: "var(--ink)",
            textDecoration: "none",
            fontWeight: 500,
            fontSize: 13,
            minHeight: 40,
          }}
        >
          {c("openDetail")}
        </Link>
        {request.status === "draft" && !readOnlyVisit ? (
          <button
            type="button"
            disabled={working}
            onClick={() => post(`/api/v1/requests/${request.id}/publish`)}
            style={{
              border: 0,
              borderRadius: 12,
              padding: "10px 16px",
              background: "var(--ink)",
              color: "var(--paper)",
              cursor: working ? "wait" : "pointer",
              opacity: working ? 0.6 : 1,
              fontWeight: 500,
              fontSize: 13,
              fontFamily: "inherit",
              minHeight: 40,
            }}
          >
            {busyAction?.endsWith("/publish") ? c("publishing") : c("publish")}
          </button>
        ) : null}
        {/* Re-notify serves two cases: nudging non-responders AND alerting the
            pool after a post-publish edit (the edit form points here). The
            backend allows it for notified too — hide it only once someone
            accepted (the next move there is assigning). */}
        {(request.status === "notified" || request.status === "responses_received") &&
        acceptedResponses.length === 0 && !readOnlyVisit ? (
          <button
            type="button"
            disabled={working}
            onClick={() => post(`/api/v1/requests/${request.id}/renotify`)}
            style={{
              border: 0,
              borderRadius: 12,
              padding: "10px 16px",
              background: "var(--moss)",
              color: "#FFFFFF",
              cursor: working ? "wait" : "pointer",
              opacity: working ? 0.6 : 1,
              fontWeight: 500,
              fontSize: 13,
              fontFamily: "inherit",
              minHeight: 40,
            }}
          >
            {busyAction?.endsWith("/renotify") ? c("renotifying") : c("renotify")}
          </button>
        ) : null}
        {!isClosed && !readOnlyVisit ? (
          <button
            type="button"
            disabled={working}
            onClick={() => post(`/api/v1/requests/${request.id}/cancel`)}
            style={{
              border: "0.5px solid var(--line)",
              borderRadius: 12,
              padding: "10px 16px",
              background: "transparent",
              color: "var(--rose)",
              cursor: working ? "wait" : "pointer",
              opacity: working ? 0.6 : 1,
              fontWeight: 500,
              fontSize: 13,
              fontFamily: "inherit",
              minHeight: 40,
            }}
          >
            {busyAction?.endsWith("/cancel") && busyAction?.includes("/requests/") ? c("cancelling") : c("cancelRequest")}
          </button>
        ) : null}
      </div>

      {error ? (
        <p style={{ margin: 0, color: "var(--rose)", fontWeight: 600, fontSize: 13 }}>
          {error}
        </p>
      ) : null}

      {assignment && assignedWorkerProfile ? (
        <AssignedWorkerCard
          worker={assignedWorkerProfile}
          assignment={assignment}
          request={request}
          disabled={working}
          onCancel={() => setCancelAssignmentOpen(true)}
          onAdjustTimes={(payload) =>
            post(`/api/v1/admin/assignments/${assignment.id}/times`, payload, "PATCH")
          }
        />
      ) : null}

      <div style={{ display: "grid", gap: 10 }}>
        <Eyebrow>{c("responsesEyebrow")}</Eyebrow>
        {responses.length === 0 && LIVE_STATUSES.has(request.status) ? (
          <p style={{ margin: 0, color: "var(--ink-3)", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <span
              aria-hidden
              style={{
                width: 12,
                height: 12,
                borderRadius: 99,
                border: "1.5px solid var(--line)",
                borderTopColor: "var(--terra)",
                animation: "sg-spin 0.9s linear infinite",
                flexShrink: 0,
              }}
            />
            {t("waiting")}
          </p>
        ) : responses.length === 0 ? (
          <p style={{ margin: 0, color: "var(--ink-3)", fontSize: 13 }}>
            {c("noneNotified")}
          </p>
        ) : (
          responses.map((response) => {
            const user = personById(response.worker_user_id);
            const palette = RESPONSE_PALETTE[response.status] ?? RESPONSE_PALETTE.notified;
            // "accepted · 06:04" — wall-clock in the shift timezone, not the browser's.
            const respondedTime = response.responded_at ? shiftTime(response.responded_at) || null : null;
            return (
              <div
                key={response.id}
                style={{
                  borderRadius: 14,
                  padding: 14,
                  background: palette.bg,
                  border: "0.5px solid var(--line)",
                  display: "grid",
                  gap: 8,
                  animation: newResponseIds.has(response.id) ? "sg-fade-in 280ms ease-out" : undefined,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div>
                    <strong style={{ fontSize: 14, fontWeight: 600 }}>
                      {user ? `${user.first_name} ${user.last_name}` : c("unknownSubstitute")}
                    </strong>
                    {user ? (
                      <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{user.email}</div>
                    ) : null}
                  </div>
                  <span
                    style={{
                      borderRadius: 999,
                      padding: "4px 10px",
                      background: palette.chip,
                      color: palette.chipColor,
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.03em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.has(`response.${response.status}`) ? c(`response.${response.status}`) : formatStatus(response.status)}
                  </span>
                </div>
                {response.status === "accepted" && respondedTime ? (
                  <div style={{ fontSize: 12, color: "var(--moss)", fontWeight: 600 }}>
                    {t("acceptedAt", { time: respondedTime })}
                  </div>
                ) : response.status === "declined" && respondedTime ? (
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                    {t("declinedAt", { time: respondedTime })}
                  </div>
                ) : response.viewed_at ? (
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                    {c("viewedAt", { date: shiftDateTime(response.viewed_at) })}
                  </div>
                ) : null}
                {response.decline_reason ? (
                  <div style={{ fontSize: 13, color: "var(--rose)" }}>
                    {c("reason", { reason: response.decline_reason })}
                  </div>
                ) : null}
                {!isClosed && !firstClaim && !readOnlyVisit ? (
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <button
                      type="button"
                      disabled={working || response.status === "accepted"}
                      onClick={() =>
                        post(`/api/v1/requests/${request.id}/responses/accept`, {
                          worker_user_id: response.worker_user_id,
                        })
                      }
                      style={{
                        border: 0,
                        borderRadius: 10,
                        padding: "8px 14px",
                        background: "var(--moss)",
                        color: "#FFFFFF",
                        cursor: response.status === "accepted" ? "default" : "pointer",
                        fontWeight: 500,
                        fontSize: 13,
                        fontFamily: "inherit",
                        opacity: response.status === "accepted" ? 0.4 : 1,
                        minHeight: 36,
                      }}
                    >
                      {c("accept")}
                    </button>
                    <button
                      type="button"
                      disabled={working || response.status === "declined"}
                      onClick={() =>
                        post(`/api/v1/requests/${request.id}/responses/decline`, {
                          worker_user_id: response.worker_user_id,
                        })
                      }
                      style={{
                        border: "0.5px solid var(--line)",
                        borderRadius: 10,
                        padding: "8px 14px",
                        background: "transparent",
                        color: "var(--rose)",
                        cursor: response.status === "declined" ? "default" : "pointer",
                        fontWeight: 500,
                        fontSize: 13,
                        fontFamily: "inherit",
                        opacity: response.status === "declined" ? 0.4 : 1,
                        minHeight: 36,
                      }}
                    >
                      {c("decline")}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {/* Review + Assign cards and the "opens after someone accepts" hint only
          while the request can still be filled — an expired request kept an
          "Assign Eva" card here after #8 hid the Best-match one. */}
      {!isClosed && !firstClaim && acceptedResponses.length > 0 ? (
        <div style={{ display: "grid", gap: 12 }}>
          <Eyebrow>{c("reviewEyebrow")}</Eyebrow>
          {acceptedResponses.map((response) => {
            const worker = workers.find((item) => item.id === response.worker_user_id);
            if (!worker) return null;
            return (
              <WorkerReviewCard
                key={worker.id}
                worker={worker}
                request={request}
                disabled={working}
                onConfirm={() =>
                  post("/api/v1/assignments", {
                    staffing_request_id: request.id,
                    worker_user_id: worker.id,
                    notes: "Assigned after worker profile review",
                  })
                }
              />
            );
          })}
        </div>
      ) : !isClosed && !firstClaim && responses.length > 0 ? (
        <div
          style={{
            padding: 14,
            borderRadius: 12,
            background: "var(--sand-soft)",
            color: "#8C6B14",
            fontSize: 13,
            fontWeight: 500,
            border: "0.5px solid #E6D08F",
          }}
        >
          {c("opensAfterAccept")}
        </div>
      ) : null}

      {assignment && cancelAssignmentOpen ? (
        <CancelAssignmentModal
          workerName={
            assignedWorker
              ? `${assignedWorker.first_name} ${assignedWorker.last_name}`
              : c("thisSubstitute")
          }
          reason={cancelReason}
          notes={cancelNotes}
          disabled={working}
          onReasonChange={setCancelReason}
          onNotesChange={setCancelNotes}
          onClose={() => setCancelAssignmentOpen(false)}
          onConfirm={() => {
            setCancelAssignmentOpen(false);
            post(`/api/v1/assignments/${assignment.id}/cancel`, {
              reason: cancelReason,
              notes: cancelNotes.trim() || undefined,
            });
          }}
        />
      ) : null}
    </article>
  );
}

const CHECKIN_GRACE_MINUTES = 15; // mirrors settings.checkin_grace_minutes

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function scheduledHoursOf(request: StaffingRequest): number {
  const [sh, sm] = request.start_time.split(":").map(Number);
  const [eh, em] = request.end_time.split(":").map(Number);
  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes <= 0) minutes += 24 * 60; // crosses midnight
  return Math.round((minutes / 60) * 100) / 100;
}

function AssignedWorkerCard({
  worker,
  assignment,
  request,
  disabled,
  onCancel,
  onAdjustTimes,
}: {
  worker: Worker;
  assignment: Assignment;
  request: StaffingRequest;
  disabled: boolean;
  onCancel: () => void;
  onAdjustTimes: (payload: { checked_in_at?: string; checked_out_at?: string; reason: string }) => void;
}) {
  const profile = worker.profile;
  const c = useTranslations("admin.detail.card");
  const labels = useDetailLabels();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustIn, setAdjustIn] = useState("");
  const [adjustOut, setAdjustOut] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  const shiftStart = new Date(`${request.work_date}T${request.start_time}`);
  const startedMinutesAgo = Math.floor((Date.now() - shiftStart.getTime()) / 60000);
  const notCheckedIn =
    !assignment.checked_in_at &&
    assignment.status === "confirmed" &&
    startedMinutesAgo > CHECKIN_GRACE_MINUTES;
  const scheduledHours = scheduledHoursOf(request);
  const readOnlyVisit = useReadOnlyVisit();
  const canAdjust = !!assignment.checked_in_at && assignment.status !== "cancelled" && !readOnlyVisit;
  // Derived by the backend; a confirmed row never changes status on its own,
  // so this is the only honest "what happened" signal once the shift is over.
  const missed = assignment.attendance === "missed";
  const finished = ["missed", "unclosed", "completed"].includes(assignment.attendance ?? "");

  function openAdjust() {
    setAdjustIn(toLocalInput(assignment.checked_in_at));
    setAdjustOut(toLocalInput(assignment.checked_out_at));
    setAdjustReason("");
    setAdjustOpen(true);
  }

  return (
    <article
      style={{
        borderRadius: 14,
        padding: 16,
        background: "var(--moss-soft)",
        border: "0.5px solid #C8DCC1",
        display: "grid",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <Eyebrow style={{ color: "var(--moss)", marginBottom: 4 }}>{c("assignedEyebrow")}</Eyebrow>
          <strong style={{ display: "block", fontSize: 16, fontWeight: 600 }}>
            {worker.first_name} {worker.last_name}
          </strong>
          <span style={{ display: "block", marginTop: 2, color: "var(--ink-2)", fontSize: 13 }}>
            {worker.email}
          </span>
        </div>
        <StatusChip label={missed ? c("noShow") : labels.assignmentStatus(assignment.status)} tone={missed ? "warn" : "good"} />
      </div>

      <div style={{ display: "grid", gap: 6, color: "var(--ink-2)", fontSize: 13 }}>
        <span><strong style={{ color: "var(--ink)" }}>{c("availability")}</strong> {profile ? labels.availability(profile.availability_status) : c("noProfile")}</span>
        <span><strong style={{ color: "var(--ink)" }}>{c("language")}</strong> {labels.language(worker.preferred_language, c("none"))}</span>
        <span><strong style={{ color: "var(--ink)" }}>{c("cities")}</strong> {profile?.supported_cities.join(", ") || c("none")}</span>
        <span><strong style={{ color: "var(--ink)" }}>{c("qualifications")}</strong> {labels.credentials(profile?.qualifications, c("none"))}</span>
        <span><strong style={{ color: "var(--ink)" }}>{c("certifications")}</strong> {labels.credentials(profile?.certifications, c("none"))}</span>
        <span><strong style={{ color: "var(--ink)" }}>{c("assignedAt")}</strong> {shiftDateTime(assignment.assigned_at)}</span>
        {assignment.checked_in_at ? (
          <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--moss)", fontWeight: 600 }}>
            <CheckCircle2 size={14} strokeWidth={2.5} />
            {c("checkedInAt", { date: shiftDateTime(assignment.checked_in_at) })}
            {assignment.checked_in_latitude && assignment.checked_in_longitude ? ` · ${c("locationRecorded")}` : ""}
          </span>
        ) : missed ? (
          <span style={{ color: "var(--rose)", fontWeight: 700 }}>
            {c("noShowNever")}
            {assignment.no_show_alerted_at ? ` · ${c("alertSent", { time: shiftTime(assignment.no_show_alerted_at) })}` : ""}
          </span>
        ) : notCheckedIn ? (
          <span style={{ color: "var(--rose)", fontWeight: 700 }}>
            {startedMinutesAgo < 120
              ? c("notCheckedInMin", { n: startedMinutesAgo })
              : c("notCheckedInHours", { n: Math.floor(startedMinutesAgo / 60) })}
          </span>
        ) : (
          <span style={{ color: "var(--ink-3)" }}><strong style={{ color: "var(--ink)" }}>{c("checkIn")}</strong> {c("notYet")}</span>
        )}
        {assignment.checked_in_at && (
          assignment.checked_out_at ? (
            <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--moss)", fontWeight: 600 }}>
              <CheckCircle2 size={14} strokeWidth={2.5} />
              {c("checkedOutAt", { date: shiftDateTime(assignment.checked_out_at) })}
            </span>
          ) : (
            <span style={{ color: "#8C6B14", fontWeight: 600 }}>{c("checkOutMissing")}</span>
          )
        )}
        {assignment.worked_hours != null && (
          <span>
            <strong style={{ color: "var(--ink)" }}>{c("worked")}</strong> {assignment.worked_hours} h
            {" "}<span style={{ color: "var(--ink-3)" }}>
              {c("workedDetail", {
                scheduled: String(scheduledHours),
                variance: `${assignment.worked_hours - scheduledHours >= 0 ? "+" : ""}${
                  Math.round((assignment.worked_hours - scheduledHours) * 100) / 100
                }`,
              })}
            </span>
          </span>
        )}
        {assignment.hours_adjusted_at && (
          <span style={{
            background: "var(--sand-soft)",
            border: "0.5px solid var(--sand)",
            borderRadius: 8,
            padding: "6px 10px",
            color: "#8C6B14",
            fontSize: 12,
          }}>
            {c("timesCorrected")}
            {assignment.hours_adjustment_reason ? ` — ${assignment.hours_adjustment_reason}` : ""}
          </span>
        )}
      </div>

      {canAdjust && (
        <button
          type="button"
          disabled={disabled}
          onClick={openAdjust}
          style={{
            border: "0.5px solid var(--line)",
            borderRadius: 10,
            padding: "10px 16px",
            background: "transparent",
            color: "var(--ink-2)",
            cursor: disabled ? "wait" : "pointer",
            fontWeight: 500,
            fontSize: 13,
            fontFamily: "inherit",
            minHeight: 40,
          }}
        >
          {c("adjustTimes")}
        </button>
      )}

      {adjustOpen && (
        <div style={{
          border: "0.5px solid var(--line)",
          borderRadius: 12,
          padding: 14,
          background: "var(--card)",
          display: "grid",
          gap: 10,
        }}>
          <Eyebrow>{c("correctEyebrow")}</Eyebrow>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-2)" }}>
            {c("checkInField")}
            <input
              type="datetime-local"
              value={adjustIn}
              onChange={(e) => setAdjustIn(e.target.value)}
              style={{ border: "0.5px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13 }}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-2)" }}>
            {c("checkOutField")}
            <input
              type="datetime-local"
              value={adjustOut}
              onChange={(e) => setAdjustOut(e.target.value)}
              style={{ border: "0.5px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13 }}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-2)" }}>
            {c("adjustReason")}
            <input
              type="text"
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              placeholder={c("adjustPlaceholder")}
              style={{ border: "0.5px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13 }}
            />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              disabled={disabled || !adjustReason.trim()}
              onClick={() => {
                setAdjustOpen(false);
                onAdjustTimes({
                  ...(adjustIn ? { checked_in_at: new Date(adjustIn).toISOString() } : {}),
                  ...(adjustOut ? { checked_out_at: new Date(adjustOut).toISOString() } : {}),
                  reason: adjustReason.trim(),
                });
              }}
              style={{
                border: "none",
                borderRadius: 10,
                padding: "10px 16px",
                background: adjustReason.trim() ? "var(--ink)" : "var(--line)",
                color: "var(--paper)",
                cursor: disabled || !adjustReason.trim() ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: 13,
                fontFamily: "inherit",
              }}
            >
              {c("saveCorrection")}
            </button>
            <button
              type="button"
              onClick={() => setAdjustOpen(false)}
              style={{
                border: "0.5px solid var(--line)",
                borderRadius: 10,
                padding: "10px 16px",
                background: "transparent",
                color: "var(--ink-2)",
                cursor: "pointer",
                fontWeight: 500,
                fontSize: 13,
                fontFamily: "inherit",
              }}
            >
              {c("cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Nothing left to cancel once the shift is over — hours are the
          coordinator's remaining lever (Adjust recorded times above). */}
      {!finished && !readOnlyVisit && (
      <button
        type="button"
        disabled={disabled}
        onClick={onCancel}
        style={{
          border: "0.5px solid var(--line)",
          borderRadius: 10,
          padding: "10px 16px",
          background: "transparent",
          color: "var(--rose)",
          cursor: disabled ? "wait" : "pointer",
          fontWeight: 500,
          fontSize: 13,
          fontFamily: "inherit",
          minHeight: 40,
        }}
      >
        {c("cancelAssignment")}
      </button>
      )}
    </article>
  );
}

function CancelAssignmentModal({
  workerName,
  reason,
  notes,
  disabled,
  onReasonChange,
  onNotesChange,
  onClose,
  onConfirm,
}: {
  workerName: string;
  reason: string;
  notes: string;
  disabled: boolean;
  onReasonChange: (reason: string) => void;
  onNotesChange: (notes: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const c = useTranslations("admin.detail.card");
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(21, 20, 15, 0.4)",
        display: "grid",
        placeItems: "center",
        padding: 18,
      }}
      onClick={onClose}
    >
      <section
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(100%, 460px)",
          borderRadius: 18,
          padding: 22,
          background: "var(--paper)",
          boxShadow: "0 24px 60px rgba(21, 20, 15, 0.25)",
          display: "grid",
          gap: 16,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 22, lineHeight: 1.15, fontWeight: 400 }}>
            {c("cancelAssignment")}
          </h3>
          <p style={{ margin: "8px 0 0", color: "var(--ink-2)", fontSize: 13, lineHeight: 1.5 }}>
            {c("cancelBody", { name: workerName })}
          </p>
        </div>

        <label style={{ display: "grid", gap: 8, color: "var(--ink)", fontWeight: 500, fontSize: 13 }}>
          {c("reasonLabel")}
          <select
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            style={{
              borderRadius: 10,
              border: "0.5px solid var(--line)",
              padding: "11px 14px",
              background: "#fff",
              color: "var(--ink)",
              font: "inherit",
              fontSize: 14,
            }}
          >
            {ASSIGNMENT_CANCELLATION_REASONS.map((item) => (
              <option key={item.key} value={item.value}>
                {c(`cancelReasons.${item.key}`)}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: 8, color: "var(--ink)", fontWeight: 500, fontSize: 13 }}>
          {c("notesLabel")}
          <textarea
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            rows={4}
            placeholder={c("optionalDetails")}
            style={{
              borderRadius: 10,
              border: "0.5px solid var(--line)",
              padding: "11px 14px",
              background: "#fff",
              color: "var(--ink)",
              font: "inherit",
              fontSize: 14,
              resize: "vertical",
            }}
          />
        </label>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            type="button"
            disabled={disabled}
            onClick={onClose}
            style={{
              border: "0.5px solid var(--line)",
              borderRadius: 12,
              padding: "11px 16px",
              background: "transparent",
              color: "var(--ink)",
              cursor: disabled ? "wait" : "pointer",
              fontWeight: 500,
              fontSize: 13,
              fontFamily: "inherit",
              minHeight: 40,
            }}
          >
            {c("keepAssignment")}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onConfirm}
            style={{
              border: 0,
              borderRadius: 12,
              padding: "11px 16px",
              background: "var(--rose)",
              color: "var(--paper)",
              cursor: disabled ? "wait" : "pointer",
              fontWeight: 500,
              fontSize: 13,
              fontFamily: "inherit",
              minHeight: 40,
            }}
          >
            {c("cancelAssignment")}
          </button>
        </div>
      </section>
    </div>
  );
}

function WorkerReviewCard({
  worker,
  request,
  disabled,
  onConfirm,
}: {
  worker: Worker;
  request: StaffingRequest;
  disabled: boolean;
  onConfirm: () => void;
}) {
  const profile = worker.profile;
  const missingQualification = missingItems(request.required_qualifications, profile?.qualifications || []);
  const missingCertification = missingItems(request.required_certifications || [], profile?.certifications || []);
  const languageMatches = !request.language_requirement || worker.preferred_language === request.language_requirement || worker.preferred_language === "bilingual";
  const cityMatches = Boolean(profile?.supported_cities.includes(request.city));
  const readOnlyVisit = useReadOnlyVisit();
  const c = useTranslations("admin.detail.card");
  const labels = useDetailLabels();
  const credentialLabel = useCredentialLabel();

  return (
    <article
      style={{
        borderRadius: 14,
        padding: 16,
        background: "var(--moss-soft)",
        border: "0.5px solid #C8DCC1",
        display: "grid",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <strong style={{ display: "block", fontSize: 16, fontWeight: 600 }}>
            {worker.first_name} {worker.last_name}
          </strong>
          <span style={{ display: "block", marginTop: 2, color: "var(--ink-2)", fontSize: 13 }}>
            {worker.email}
          </span>
        </div>
        <StatusChip
          label={profile ? labels.availability(profile.availability_status) : c("noProfile")}
          tone={profile?.availability_status === "available" ? "good" : "warn"}
        />
      </div>

      <div style={{ display: "grid", gap: 6, color: "var(--ink-2)", fontSize: 13 }}>
        <span><strong style={{ color: "var(--ink)" }}>{c("language")}</strong> {labels.language(worker.preferred_language, c("none"))}</span>
        <span><strong style={{ color: "var(--ink)" }}>{c("cities")}</strong> {profile?.supported_cities.join(", ") || c("none")}</span>
        <span><strong style={{ color: "var(--ink)" }}>{c("qualifications")}</strong> {labels.credentials(profile?.qualifications, c("none"))}</span>
        <span><strong style={{ color: "var(--ink)" }}>{c("certifications")}</strong> {labels.credentials(profile?.certifications, c("none"))}</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <StatusChip label={cityMatches ? c("cityMatch") : c("missing", { item: request.city })} tone={cityMatches ? "good" : "warn"} />
        <StatusChip label={languageMatches ? c("languageMatch") : c("missing", { item: labels.language(request.language_requirement, "") })} tone={languageMatches ? "good" : "warn"} />
        {missingQualification.length === 0 ? (
          <StatusChip label={c("qualificationMatch")} tone="good" />
        ) : (
          missingQualification.map((item) => <StatusChip key={item} label={c("missing", { item: credentialLabel(item) })} tone="warn" />)
        )}
        {missingCertification.length === 0 ? (
          <StatusChip label={c("certificationMatch")} tone="good" />
        ) : (
          missingCertification.map((item) => <StatusChip key={item} label={c("missing", { item: credentialLabel(item) })} tone="warn" />)
        )}
      </div>

      {readOnlyVisit ? null : (
      <button
        type="button"
        disabled={disabled}
        onClick={onConfirm}
        style={{
          border: 0,
          borderRadius: 12,
          padding: "11px 16px",
          background: "var(--ink)",
          color: "var(--paper)",
          cursor: disabled ? "wait" : "pointer",
          fontWeight: 500,
          fontSize: 14,
          fontFamily: "inherit",
          minHeight: 44,
        }}
      >
        {disabled ? c("assigning") : c("assign", { name: worker.first_name })}
      </button>
      )}
    </article>
  );
}

function StatusChip({ label, tone }: { label: string; tone: "good" | "warn" }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        padding: "4px 10px",
        background: tone === "good" ? "var(--moss)" : "var(--rose-soft)",
        color: tone === "good" ? "#FFFFFF" : "var(--rose)",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.03em",
      }}
    >
      {label}
    </span>
  );
}

function missingItems(required: string[], workerItems: string[]): string[] {
  const workerSet = new Set(workerItems);
  return required.filter((item) => !workerSet.has(item));
}
