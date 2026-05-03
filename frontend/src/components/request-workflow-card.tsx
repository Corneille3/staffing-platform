"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { availabilityStatusLabel } from "../lib/status-labels";
import { Assignment, RequestResponse, StaffingRequest, User, Worker } from "../lib/types";

const browserApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

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
    const response = await fetch(`${browserApiBaseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      setError(text || `Action failed with status ${response.status}`);
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <article
      style={{
        borderRadius: 22,
        padding: 20,
        background: "#fffdf7",
        border: "1px solid rgba(24, 50, 41, 0.1)",
        display: "grid",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24 }}>{request.title}</h2>
          <p style={{ margin: "8px 0 0", color: "#496158" }}>
            {request.city} · {request.work_date} · {request.start_time.slice(0, 5)} - {request.end_time.slice(0, 5)}
          </p>
        </div>
        <span
          style={{
            borderRadius: 999,
            padding: "6px 12px",
            background: request.status === "assigned" ? "#d2ead8" : "#efe3b9",
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {formatStatus(request.status)}
        </span>
      </div>

      <div style={{ color: "#3d564c", display: "grid", gap: 6 }}>
        <span>{request.description || "No additional notes."}</span>
        <span>
          {request.coverage_type ? `${COVERAGE_TYPE_LABELS[request.coverage_type] ?? request.coverage_type} · ` : ""}
          Language: {request.language_requirement || "none"} · Urgency {request.urgency_level}
        </span>
        <span>Required qualifications: {request.required_qualifications.join(", ") || "none"}</span>
        <span>Required certifications: {request.required_certifications?.join(", ") || "none"}</span>
        {assignedWorker ? (
          <span>
            Assigned to: {assignedWorker.first_name} {assignedWorker.last_name}
            {assignment ? ` · ${formatStatus(assignment.status)}` : ""}
          </span>
        ) : null}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Link
          href={`/admin/requests/${request.id}`}
          style={{
            borderRadius: 999,
            padding: "12px 16px",
            background: "#e4eadf",
            color: "#183229",
            textDecoration: "none",
            fontWeight: 700,
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
              borderRadius: 999,
              padding: "12px 16px",
              background: "#183229",
              color: "#f7f0df",
              cursor: "pointer",
              fontWeight: 700,
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
              borderRadius: 999,
              padding: "12px 16px",
              background: "#3d6b5a",
              color: "#f7f0df",
              cursor: "pointer",
              fontWeight: 700,
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
              border: 0,
              borderRadius: 999,
              padding: "12px 16px",
              background: "#eadfd7",
              color: "#7a473f",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Cancel request
          </button>
        ) : null}
      </div>

      {error ? (
        <p style={{ margin: 0, color: "#8c3f32", fontWeight: 700 }}>
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
        <strong style={{ fontSize: 18 }}>Substitute responses</strong>
        {workerUsers.map((worker) => {
          const response = responses.find((item) => item.worker_user_id === worker.id);
          return (
            <div
              key={worker.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 12,
                alignItems: "center",
                borderRadius: 16,
                padding: 14,
                background: "#f7f1e4",
              }}
            >
              <div>
                <strong>
                  {worker.first_name} {worker.last_name}
                </strong>
                <div style={{ marginTop: 4, color: "#5d6d66", fontSize: 14 }}>
                  {response ? workerResponseLabel(response.status) : "Not notified"}
                </div>
                {response?.viewed_at ? (
                  <div style={{ marginTop: 2, color: "#8a9e95", fontSize: 12 }}>
                    Viewed {response.viewed_at.slice(0, 16).replace("T", " ")}
                  </div>
                ) : null}
              </div>
              {!isClosed ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    disabled={isPending || !response || response.status === "accepted"}
                    onClick={() =>
                      post(`/api/v1/requests/${request.id}/responses/accept`, {
                        worker_user_id: worker.id,
                      })
                    }
                    style={{
                      border: 0,
                      borderRadius: 999,
                      padding: "10px 12px",
                      background: "#214639",
                      color: "#f7f0df",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={isPending || !response || response.status === "declined"}
                    onClick={() =>
                      post(`/api/v1/requests/${request.id}/responses/decline`, {
                        worker_user_id: worker.id,
                      })
                    }
                    style={{
                      border: 0,
                      borderRadius: 999,
                      padding: "10px 12px",
                      background: "#eadfd7",
                      color: "#7a473f",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    Decline
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {request.status !== "assigned" && acceptedResponses.length > 0 && orgAdmin ? (
        <div style={{ display: "grid", gap: 12 }}>
          <strong style={{ fontSize: 18 }}>Review accepted workers</strong>
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
            padding: 16,
            borderRadius: 18,
            background: "#f7f1e4",
            color: "#5d4c37",
            fontWeight: 700,
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
        borderRadius: 18,
        padding: 16,
        background: "#e2ebdd",
        display: "grid",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
        <div>
          <strong style={{ display: "block", fontSize: 18 }}>
            Assigned substitute: {worker.first_name} {worker.last_name}
          </strong>
          <span style={{ display: "block", marginTop: 4, color: "#496158", fontSize: 14 }}>
            {worker.email}
          </span>
        </div>
        <StatusChip label={formatStatus(assignment.status)} tone="good" />
      </div>

      <div style={{ display: "grid", gap: 8, color: "#314c42", fontSize: 14 }}>
        <span><strong>Availability:</strong> {profile ? availabilityStatusLabel(profile.availability_status) : "no profile"}</span>
        <span><strong>Language:</strong> {worker.preferred_language}</span>
        <span><strong>Cities:</strong> {profile?.supported_cities.join(", ") || "none"}</span>
        <span><strong>Qualifications:</strong> {profile?.qualifications.join(", ") || "none"}</span>
        <span><strong>Certifications:</strong> {profile?.certifications.join(", ") || "none"}</span>
        <span><strong>Assigned at:</strong> {assignment.assigned_at.slice(0, 16).replace("T", " ")}</span>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={onCancel}
        style={{
          border: 0,
          borderRadius: 999,
          padding: "12px 16px",
          background: "#eadfd7",
          color: "#7a473f",
          cursor: disabled ? "wait" : "pointer",
          fontWeight: 800,
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
        background: "rgba(24, 50, 41, 0.35)",
        display: "grid",
        placeItems: "center",
        padding: 18,
      }}
    >
      <section
        style={{
          width: "min(100%, 460px)",
          borderRadius: 22,
          padding: 20,
          background: "#fffdf7",
          boxShadow: "0 18px 40px rgba(24, 50, 41, 0.22)",
          display: "grid",
          gap: 16,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 22 }}>Cancel assignment</h3>
          <p style={{ margin: "8px 0 0", color: "#496158", lineHeight: 1.45 }}>
            Cancel the confirmed shift for {workerName}. The request will reopen for coordinator review.
          </p>
        </div>

        <label style={{ display: "grid", gap: 8, color: "#314c42", fontWeight: 800 }}>
          Reason
          <select
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            style={{
              borderRadius: 12,
              border: "1px solid rgba(24, 50, 41, 0.18)",
              padding: "12px 14px",
              background: "#fff",
              color: "#183229",
              font: "inherit",
            }}
          >
            {ASSIGNMENT_CANCELLATION_REASONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: 8, color: "#314c42", fontWeight: 800 }}>
          Notes
          <textarea
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            rows={4}
            placeholder="Optional details"
            style={{
              borderRadius: 12,
              border: "1px solid rgba(24, 50, 41, 0.18)",
              padding: "12px 14px",
              background: "#fff",
              color: "#183229",
              font: "inherit",
              resize: "vertical",
            }}
          />
        </label>

        <div style={{ display: "flex", justifyContent: "end", gap: 10 }}>
          <button
            type="button"
            disabled={disabled}
            onClick={onClose}
            style={{
              border: 0,
              borderRadius: 999,
              padding: "12px 16px",
              background: "#e4eadf",
              color: "#183229",
              cursor: disabled ? "wait" : "pointer",
              fontWeight: 800,
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
              borderRadius: 999,
              padding: "12px 16px",
              background: "#7a3526",
              color: "#fffdf7",
              cursor: disabled ? "wait" : "pointer",
              fontWeight: 800,
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
        borderRadius: 18,
        padding: 16,
        background: "#e2ebdd",
        display: "grid",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
        <div>
          <strong style={{ display: "block", fontSize: 18 }}>
            {worker.first_name} {worker.last_name}
          </strong>
          <span style={{ display: "block", marginTop: 4, color: "#496158", fontSize: 14 }}>
            {worker.email}
          </span>
        </div>
        <StatusChip
          label={profile ? availabilityStatusLabel(profile.availability_status) : "no profile"}
          tone={profile?.availability_status === "available" ? "good" : "warn"}
        />
      </div>

      <div style={{ display: "grid", gap: 8, color: "#314c42", fontSize: 14 }}>
        <span><strong>Language:</strong> {worker.preferred_language}</span>
        <span><strong>Cities:</strong> {profile?.supported_cities.join(", ") || "none"}</span>
        <span><strong>Qualifications:</strong> {profile?.qualifications.join(", ") || "none"}</span>
        <span><strong>Certifications:</strong> {profile?.certifications.join(", ") || "none"}</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
          borderRadius: 999,
          padding: "12px 16px",
          background: "#183229",
          color: "#f7f0df",
          cursor: disabled ? "wait" : "pointer",
          fontWeight: 800,
        }}
      >
        Confirm this substitute
      </button>
    </article>
  );
}

function StatusChip({ label, tone }: { label: string; tone: "good" | "warn" }) {
  return (
    <span
      style={{
        borderRadius: 999,
        padding: "6px 10px",
        background: tone === "good" ? "#d2ead8" : "#f4d4cc",
        color: tone === "good" ? "#214639" : "#7a3526",
        fontSize: 12,
        fontWeight: 800,
        textTransform: "capitalize",
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
