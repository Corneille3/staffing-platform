"use client";

import { useEffect, useState } from "react";
import { fetchAssignments, fetchRequests } from "../../../lib/browser-api";
import { Assignment, StaffingRequest } from "../../../lib/types";
import { useWorkerSession } from "../../../lib/worker-session";

type EnrichedAssignment = {
  assignment: Assignment;
  request: StaffingRequest | null;
};

export default function WorkerAssignmentsPage() {
  const { worker } = useWorkerSession();
  const [items, setItems] = useState<EnrichedAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!worker) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const [allAssignments, allRequests] = await Promise.all([
        fetchAssignments(),
        fetchRequests(),
      ]);
      if (!alive) return;
      const mine = allAssignments.filter((a) => a.worker_user_id === worker.id);
      const enriched: EnrichedAssignment[] = mine.map((assignment) => ({
        assignment,
        request: allRequests.find((r) => r.id === assignment.staffing_request_id) || null,
      }));
      enriched.sort((a, b) => {
        const aDate = a.request?.work_date || "";
        const bDate = b.request?.work_date || "";
        return aDate.localeCompare(bDate);
      });
      setItems(enriched);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [worker]);

  if (!worker) return null;

  const upcoming = items.filter(
    (i) => i.assignment.status === "pending_confirmation" || i.assignment.status === "confirmed",
  );
  const past = items.filter(
    (i) => i.assignment.status === "completed" || i.assignment.status === "cancelled",
  );

  return (
    <div style={{ display: "grid", gap: 24, paddingTop: 16 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 26 }}>My shifts</h1>
        <p style={{ margin: "6px 0 0", color: "#496158" }}>
          {upcoming.length === 0 ? "No upcoming shifts." : `${upcoming.length} upcoming`}
        </p>
      </header>

      {loading ? (
        <p style={{ color: "#496158" }}>Loading…</p>
      ) : (
        <>
          <Group title={`Upcoming (${upcoming.length})`}>
            {upcoming.length === 0 ? (
              <Empty>You have no scheduled shifts yet.</Empty>
            ) : (
              upcoming.map(({ assignment, request }) =>
                request ? (
                  <AssignmentCard key={assignment.id} assignment={assignment} request={request} />
                ) : null,
              )
            )}
          </Group>

          {past.length > 0 ? (
            <Group title={`History (${past.length})`}>
              {past.map(({ assignment, request }) =>
                request ? (
                  <AssignmentCard
                    key={assignment.id}
                    assignment={assignment}
                    request={request}
                    muted
                  />
                ) : null,
              )}
            </Group>
          ) : null}
        </>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2
        style={{
          margin: "0 0 10px",
          fontSize: 13,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#496158",
        }}
      >
        {title}
      </h2>
      <div style={{ display: "grid", gap: 12 }}>{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 18,
        borderRadius: 14,
        background: "rgba(255, 253, 247, 0.7)",
        border: "1px dashed rgba(24, 50, 41, 0.18)",
        color: "#5d6d66",
        textAlign: "center",
        fontSize: 14,
      }}
    >
      {children}
    </div>
  );
}

function AssignmentCard({
  assignment,
  request,
  muted,
}: {
  assignment: Assignment;
  request: StaffingRequest;
  muted?: boolean;
}) {
  const bg = muted ? "rgba(255, 253, 247, 0.7)" : "#214639";
  const fg = muted ? "#3d564c" : "#f7f0df";
  const sub = muted ? "#5d6d66" : "rgba(247, 240, 223, 0.78)";
  return (
    <article
      style={{
        background: bg,
        color: fg,
        borderRadius: 20,
        padding: 18,
        boxShadow: muted ? "none" : "0 8px 18px rgba(24, 50, 41, 0.18)",
        display: "grid",
        gap: 10,
        opacity: muted ? 0.85 : 1,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
        <strong style={{ fontSize: 18 }}>{request.title}</strong>
        <span
          style={{
            borderRadius: 999,
            padding: "4px 10px",
            background: muted ? "rgba(24, 50, 41, 0.08)" : "rgba(247, 240, 223, 0.18)",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {assignment.status.replace(/_/g, " ")}
        </span>
      </div>
      <div style={{ display: "grid", gap: 4, color: sub, fontSize: 14 }}>
        <span>📍 {request.location_name ? `${request.location_name}, ${request.city}` : request.city}</span>
        <span>📅 {request.work_date}</span>
        <span>
          🕒 {request.start_time.slice(0, 5)} – {request.end_time.slice(0, 5)}
        </span>
      </div>
      {assignment.notes ? (
        <p style={{ margin: 0, color: sub, fontSize: 14, lineHeight: 1.5 }}>{assignment.notes}</p>
      ) : null}
    </article>
  );
}
