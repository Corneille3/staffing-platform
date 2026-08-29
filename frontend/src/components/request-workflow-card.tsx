"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { errorMessageFromResponse } from "../lib/browser-api";
import { availabilityStatusLabel } from "../lib/status-labels";
import { LIVE_STATUSES, useRequestLive } from "./request-live";
import { Eyebrow } from "./ui";
import { Assignment, RequestResponse, StaffingRequest, User, Worker } from "../lib/types";

const browserApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
type ClerkLike = { session?: { getToken: () => Promise<string | null> } };

function formatStatus(value: string) {
  return value.replace(/_/g, " ");
}

// "accepted · 6:04" — local wall-clock time of the response.
function clockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(11, 16);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function workerResponseLabel(status: string): string {
  switch (status) {
    case "notified": return "Notified — awaiting reply";
    case "viewed": return "Viewed — awaiting reply";
    case "accepted": return "Accepted";
    case "declined": return "Declined";
    case "no_response": return "No response";
    default: return formatStatus(status);
  }
}

const RESPONSE_PALETTE: Record<string, { bg: string; chip: string; chipColor: string; label: string }> = {
  notified:    { bg: "var(--paper-2)",  chip: "var(--sand-soft)",  chipColor: "#8C6B14",      label: "Awaiting reply" },
  viewed:      { bg: "var(--paper-2)",  chip: "var(--sand-soft)",  chipColor: "#8C6B14",      label: "Viewed — no reply yet" },
  accepted:    { bg: "var(--moss-soft)", chip: "var(--moss)",      chipColor: "#FFFFFF",      label: "Accepted" },
  declined:    { bg: "var(--rose-soft)", chip: "var(--rose-soft)", chipColor: "var(--rose)",  label: "Declined" },
  no_response: { bg: "var(--paper-2)",  chip: "var(--line)",       chipColor: "var(--ink-3)", label: "No response" },
  withdrawn:   { bg: "var(--paper-2)",  chip: "var(--line)",       chipColor: "var(--ink-3)", label: "Withdrawn" },
};

const COVERAGE_TYPE_LABELS: Record<string, string> = {
  same_day_urgent: "Same-day urgent",
  planned_absence: "Planned absence",
  recurring: "Recurring",
  emergency: "Emergency",
};

const ASSIGNMENT_CANCELLATION_REASONS = [
  "Substitute unavailable",
  "Coordinator changed plan",
  "Request no longer needed",
  "Other",
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
  const request = live?.request ?? initialRequest;
  const responses = sortResponses(live?.responses ?? initialResponses);
  const assignment = live ? live.assignment : initialAssignment;
  const t = useTranslations("admin.live");
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
  const [cancelReason, setCancelReason] = useState(ASSIGNMENT_CANCELLATION_REASONS[0]);
  const [cancelNotes, setCancelNotes] = useState("");

  const workerUsers = users.filter((user) => user.role === "worker");
  const orgAdmin = users.find((user) => user.role === "org_admin");
  const acceptedResponses = responses.filter((response) => response.status === "accepted");
  const assignedWorker = users.find((user) => user.id === request.assigned_worker_user_id || user.id === assignment?.worker_user_id);
  const assignedWorkerProfile = workers.find((worker) => worker.id === assignment?.worker_user_id) || null;
  const isClosed = request.status === "assigned" || request.status === "cancelled" || request.status === "completed";

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
        setError(await errorMessageFromResponse(response, `Action failed with status ${response.status}`));
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
      setError("Network error — please try again.");
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
          {formatStatus(request.status)}
        </span>
      </div>

      <div style={{ color: "var(--ink-2)", display: "grid", gap: 6, fontSize: 13, lineHeight: 1.5 }}>
        <span>{request.description || "No additional notes."}</span>
        <span>
          {request.coverage_type ? `${COVERAGE_TYPE_LABELS[request.coverage_type] ?? request.coverage_type} · ` : ""}
          Language: {request.language_requirement || "none"} · Urgency {request.urgency_level}
        </span>
        <span>Required qualifications: {request.required_qualifications.join(", ") || "none"}</span>
        <span>Required certifications: {request.required_certifications?.join(", ") || "none"}</span>
        {assignedWorker ? (
          <span>
            Assigned to: <strong style={{ color: "var(--ink)" }}>{assignedWorker.first_name} {assignedWorker.last_name}</strong>
            {assignment ? ` · ${formatStatus(assignment.status)}` : ""}
          </span>
        ) : null}
      </div>

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
          Open detail
        </Link>
        {request.status === "draft" ? (
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
            {busyAction?.endsWith("/publish") ? "Publishing…" : "Publish request"}
          </button>
        ) : null}
        {/* Re-notify serves two cases: nudging non-responders AND alerting the
            pool after a post-publish edit (the edit form points here). The
            backend allows it for notified too — hide it only once someone
            accepted (the next move there is assigning). */}
        {(request.status === "notified" || request.status === "responses_received") &&
        acceptedResponses.length === 0 ? (
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
            {busyAction?.endsWith("/renotify") ? "Re-notifying…" : "Re-notify workers"}
          </button>
        ) : null}
        {!isClosed ? (
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
            {busyAction?.endsWith("/cancel") && busyAction?.includes("/requests/") ? "Cancelling…" : "Cancel request"}
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
        <Eyebrow>Substitute responses</Eyebrow>
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
            No substitutes have been notified yet.
          </p>
        ) : (
          responses.map((response) => {
            const user = users.find((u) => u.id === response.worker_user_id);
            const palette = RESPONSE_PALETTE[response.status] ?? RESPONSE_PALETTE.notified;
            const respondedTime = response.responded_at ? clockTime(response.responded_at) : null;
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
                      {user ? `${user.first_name} ${user.last_name}` : "Unknown substitute"}
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
                    {palette.label}
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
                    Viewed {response.viewed_at.slice(0, 16).replace("T", " ")}
                  </div>
                ) : null}
                {response.decline_reason ? (
                  <div style={{ fontSize: 13, color: "var(--rose)" }}>
                    Reason: {response.decline_reason}
                  </div>
                ) : null}
                {!isClosed ? (
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
                      Accept
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
                      Decline
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {request.status !== "assigned" && acceptedResponses.length > 0 && orgAdmin ? (
        <div style={{ display: "grid", gap: 12 }}>
          <Eyebrow>Review accepted workers</Eyebrow>
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
                    assigned_by_user_id: orgAdmin.id,
                    notes: "Assigned after worker profile review",
                  })
                }
              />
            );
          })}
        </div>
      ) : request.status !== "assigned" && responses.length > 0 ? (
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
          Assignment opens after at least one notified worker accepts.
        </div>
      ) : null}

      {assignment && cancelAssignmentOpen ? (
        <CancelAssignmentModal
          workerName={
            assignedWorker
              ? `${assignedWorker.first_name} ${assignedWorker.last_name}`
              : "this substitute"
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
  const canAdjust = !!assignment.checked_in_at && assignment.status !== "cancelled";

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
          <Eyebrow style={{ color: "var(--moss)", marginBottom: 4 }}>Assigned substitute</Eyebrow>
          <strong style={{ display: "block", fontSize: 16, fontWeight: 600 }}>
            {worker.first_name} {worker.last_name}
          </strong>
          <span style={{ display: "block", marginTop: 2, color: "var(--ink-2)", fontSize: 13 }}>
            {worker.email}
          </span>
        </div>
        <StatusChip label={formatStatus(assignment.status)} tone="good" />
      </div>

      <div style={{ display: "grid", gap: 6, color: "var(--ink-2)", fontSize: 13 }}>
        <span><strong style={{ color: "var(--ink)" }}>Availability:</strong> {profile ? availabilityStatusLabel(profile.availability_status) : "no profile"}</span>
        <span><strong style={{ color: "var(--ink)" }}>Language:</strong> {worker.preferred_language}</span>
        <span><strong style={{ color: "var(--ink)" }}>Cities:</strong> {profile?.supported_cities.join(", ") || "none"}</span>
        <span><strong style={{ color: "var(--ink)" }}>Qualifications:</strong> {profile?.qualifications.join(", ") || "none"}</span>
        <span><strong style={{ color: "var(--ink)" }}>Certifications:</strong> {profile?.certifications.join(", ") || "none"}</span>
        <span><strong style={{ color: "var(--ink)" }}>Assigned at:</strong> {assignment.assigned_at.slice(0, 16).replace("T", " ")}</span>
        {assignment.checked_in_at ? (
          <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--moss)", fontWeight: 600 }}>
            <CheckCircle2 size={14} strokeWidth={2.5} />
            Checked in at {assignment.checked_in_at.slice(0, 16).replace("T", " ")}
            {assignment.checked_in_latitude && assignment.checked_in_longitude ? " · location recorded" : ""}
          </span>
        ) : notCheckedIn ? (
          <span style={{ color: "var(--rose)", fontWeight: 700 }}>
            Not checked in — shift started {startedMinutesAgo < 120 ? `${startedMinutesAgo} min` : `${Math.floor(startedMinutesAgo / 60)} h`} ago
          </span>
        ) : (
          <span style={{ color: "var(--ink-3)" }}><strong style={{ color: "var(--ink)" }}>Check-in:</strong> not checked in yet</span>
        )}
        {assignment.checked_in_at && (
          assignment.checked_out_at ? (
            <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--moss)", fontWeight: 600 }}>
              <CheckCircle2 size={14} strokeWidth={2.5} />
              Checked out at {assignment.checked_out_at.slice(0, 16).replace("T", " ")}
            </span>
          ) : (
            <span style={{ color: "#8C6B14", fontWeight: 600 }}>Check-out: not recorded yet</span>
          )
        )}
        {assignment.worked_hours != null && (
          <span>
            <strong style={{ color: "var(--ink)" }}>Worked:</strong> {assignment.worked_hours} h
            {" "}<span style={{ color: "var(--ink-3)" }}>
              (scheduled {scheduledHours} h · variance {assignment.worked_hours - scheduledHours >= 0 ? "+" : ""}
              {Math.round((assignment.worked_hours - scheduledHours) * 100) / 100} h)
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
            Times corrected by coordinator
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
          Adjust recorded times
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
          <Eyebrow>Correct attendance times</Eyebrow>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-2)" }}>
            Check-in
            <input
              type="datetime-local"
              value={adjustIn}
              onChange={(e) => setAdjustIn(e.target.value)}
              style={{ border: "0.5px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13 }}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-2)" }}>
            Check-out
            <input
              type="datetime-local"
              value={adjustOut}
              onChange={(e) => setAdjustOut(e.target.value)}
              style={{ border: "0.5px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13 }}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-2)" }}>
            Reason (required — this edits a payroll number)
            <input
              type="text"
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              placeholder="e.g. Worker forgot to tap Done"
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
              Save correction
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
              Cancel
            </button>
          </div>
        </div>
      )}

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
        Cancel assignment
      </button>
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
            Cancel assignment
          </h3>
          <p style={{ margin: "8px 0 0", color: "var(--ink-2)", fontSize: 13, lineHeight: 1.5 }}>
            Cancel the confirmed shift for {workerName}. The request will reopen for coordinator review.
          </p>
        </div>

        <label style={{ display: "grid", gap: 8, color: "var(--ink)", fontWeight: 500, fontSize: 13 }}>
          Reason
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
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: 8, color: "var(--ink)", fontWeight: 500, fontSize: 13 }}>
          Notes
          <textarea
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            rows={4}
            placeholder="Optional details"
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
            Keep assignment
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
            Cancel assignment
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
          label={profile ? availabilityStatusLabel(profile.availability_status) : "no profile"}
          tone={profile?.availability_status === "available" ? "good" : "warn"}
        />
      </div>

      <div style={{ display: "grid", gap: 6, color: "var(--ink-2)", fontSize: 13 }}>
        <span><strong style={{ color: "var(--ink)" }}>Language:</strong> {worker.preferred_language}</span>
        <span><strong style={{ color: "var(--ink)" }}>Cities:</strong> {profile?.supported_cities.join(", ") || "none"}</span>
        <span><strong style={{ color: "var(--ink)" }}>Qualifications:</strong> {profile?.qualifications.join(", ") || "none"}</span>
        <span><strong style={{ color: "var(--ink)" }}>Certifications:</strong> {profile?.certifications.join(", ") || "none"}</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <StatusChip label={cityMatches ? "City match" : `Missing: ${request.city}`} tone={cityMatches ? "good" : "warn"} />
        <StatusChip label={languageMatches ? "Language match" : `Missing: ${request.language_requirement}`} tone={languageMatches ? "good" : "warn"} />
        {missingQualification.length === 0 ? (
          <StatusChip label="Qualification match" tone="good" />
        ) : (
          missingQualification.map((item) => <StatusChip key={item} label={`Missing: ${item}`} tone="warn" />)
        )}
        {missingCertification.length === 0 ? (
          <StatusChip label="Certification match" tone="good" />
        ) : (
          missingCertification.map((item) => <StatusChip key={item} label={`Missing: ${item}`} tone="warn" />)
        )}
      </div>

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
        {disabled ? "Assigning…" : `Assign ${worker.first_name}`}
      </button>
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
