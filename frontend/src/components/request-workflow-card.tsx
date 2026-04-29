"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Assignment, RequestResponse, StaffingRequest, User } from "../lib/types";

const browserApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

function formatStatus(value: string) {
  return value.replace(/_/g, " ");
}

export function RequestWorkflowCard({
  request,
  responses,
  users,
  assignment,
}: {
  request: StaffingRequest;
  responses: RequestResponse[];
  users: User[];
  assignment: Assignment | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [assignWorkerId, setAssignWorkerId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const workers = users.filter((user) => user.role === "worker");
  const orgAdmin = users.find((user) => user.role === "org_admin");
  const acceptedResponses = responses.filter((response) => response.status === "accepted");
  const assignedWorker = users.find((user) => user.id === request.assigned_worker_user_id || user.id === assignment?.worker_user_id);
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
        <span>Language: {request.language_requirement || "none"} · Urgency {request.urgency_level}</span>
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
          href={`/requests/${request.id}`}
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

      <div style={{ display: "grid", gap: 10 }}>
        <strong style={{ fontSize: 18 }}>Worker responses</strong>
        {workers.map((worker) => {
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
                  {response ? formatStatus(response.status) : "not notified"}
                </div>
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
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            padding: 16,
            borderRadius: 18,
            background: "#e2ebdd",
          }}
        >
          <strong>Assign accepted worker</strong>
          <select
            value={assignWorkerId}
            onChange={(event) => setAssignWorkerId(event.target.value)}
            style={{
              borderRadius: 12,
              border: "1px solid rgba(24, 50, 41, 0.2)",
              padding: "10px 12px",
              minWidth: 220,
            }}
          >
            <option value="">Choose worker</option>
            {acceptedResponses.map((response) => {
              const worker = users.find((user) => user.id === response.worker_user_id);
              if (!worker) {
                return null;
              }
              return (
                <option key={worker.id} value={worker.id}>
                  {worker.first_name} {worker.last_name}
                </option>
              );
            })}
          </select>
          <button
            type="button"
            disabled={isPending || !assignWorkerId}
            onClick={() =>
              post("/api/v1/assignments", {
                staffing_request_id: request.id,
                worker_user_id: assignWorkerId,
                assigned_by_user_id: orgAdmin.id,
                notes: "Assigned from dashboard",
              })
            }
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
            Confirm assignment
          </button>
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
    </article>
  );
}
