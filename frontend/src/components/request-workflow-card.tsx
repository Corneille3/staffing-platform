"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { errorMessageFromResponse } from "../lib/browser-api";
import { availabilityStatusLabel } from "../lib/status-labels";
import { Eyebrow } from "./ui";
import { Assignment, RequestResponse, StaffingRequest, User, Worker } from "../lib/types";

const browserApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
type ClerkLike = { session?: { getToken: () => Promise<string | null> } };

function formatStatus(value: string) {
  return value.replace(/_/g, " ");
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

export function RequestWorkflowCard({
  request,
  responses,
  users,
  workers,
  assignment,
}: {
  request: StaffingRequest;
  responses: RequestResponse[];
  users: User[];
  workers: Worker[];
  assignment: Assignment | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
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

  async function post(path: string, payload?: object) {
    setError(null);
    let token: string | null = null;
    if (CLERK_ENABLED && typeof window !== "undefined") {
      token = (await (window as unknown as { Clerk?: ClerkLike }).Clerk?.session?.getToken()) ?? null;
    }
    const response = await fetch(`${browserApiBaseUrl}${path}`, {
      method: "POST",
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

    startTransition(() => {
      router.refresh();
    });
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
            disabled={isPending}
            onClick={() => post(`/api/v1/requests/${request.id}/publish`)}
            style={{
              border: 0,
              borderRadius: 12,
              padding: "10px 16px",
              background: "var(--ink)",
              color: "var(--paper)",
              cursor: isPending ? "wait" : "pointer",
              fontWeight: 500,
              fontSize: 13,
              fontFamily: "inherit",
              minHeight: 40,
            }}
          >
            Publish request
          </button>
        ) : null}
        {request.status === "responses_received" && acceptedResponses.length === 0 ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => post(`/api/v1/requests/${request.id}/renotify`)}
            style={{
              border: 0,
              borderRadius: 12,
              padding: "10px 16px",
              background: "var(--moss)",
              color: "#FFFFFF",
              cursor: isPending ? "wait" : "pointer",
              fontWeight: 500,
              fontSize: 13,
              fontFamily: "inherit",
              minHeight: 40,
            }}
          >
            Re-notify workers
          </button>
        ) : null}
        {!isClosed ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => post(`/api/v1/requests/${request.id}/cancel`)}
            style={{
              border: "0.5px solid var(--line)",
              borderRadius: 12,
              padding: "10px 16px",
              background: "transparent",
              color: "var(--rose)",
              cursor: isPending ? "wait" : "pointer",
              fontWeight: 500,
              fontSize: 13,
              fontFamily: "inherit",
              minHeight: 40,
            }}
          >
            Cancel request
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
          disabled={isPending}
          onCancel={() => setCancelAssignmentOpen(true)}
        />
      ) : null}

      <div style={{ display: "grid", gap: 10 }}>
        <Eyebrow>Substitute responses</Eyebrow>
        {responses.length === 0 ? (
          <p style={{ margin: 0, color: "var(--ink-3)", fontSize: 13 }}>
            No substitutes have been notified yet.
          </p>
        ) : (
          responses.map((response) => {
            const user = users.find((u) => u.id === response.worker_user_id);
            const palette = RESPONSE_PALETTE[response.status] ?? RESPONSE_PALETTE.notified;
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
                {response.viewed_at ? (
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
                      disabled={isPending || response.status === "accepted"}
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
                      disabled={isPending || response.status === "declined"}
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
                disabled={isPending}
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
          disabled={isPending}
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

function AssignedWorkerCard({
  worker,
  assignment,
  disabled,
  onCancel,
}: {
  worker: Worker;
  assignment: Assignment;
  disabled: boolean;
  onCancel: () => void;
}) {
  const profile = worker.profile;

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
        ) : (
          <span style={{ color: "var(--ink-3)" }}><strong style={{ color: "var(--ink)" }}>Check-in:</strong> not checked in yet</span>
        )}
      </div>

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
