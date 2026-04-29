"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  fetchAssignments,
  fetchRequestResponses,
  fetchRequests,
} from "../../lib/browser-api";
import { Assignment, RequestResponse, StaffingRequest } from "../../lib/types";
import { useWorkerSession } from "../../lib/worker-session";

export default function WorkerHome() {
  const { worker } = useWorkerSession();
  const [requests, setRequests] = useState<StaffingRequest[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [responses, setResponses] = useState<RequestResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!worker) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const [allRequests, allAssignments] = await Promise.all([
        fetchRequests(),
        fetchAssignments(),
      ]);
      const responseLists = await Promise.all(
        allRequests.map((r) => fetchRequestResponses(r.id)),
      );
      if (!alive) return;
      setRequests(allRequests);
      setAssignments(allAssignments);
      setResponses(responseLists.flat().filter((r) => r.worker_user_id === worker.id));
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [worker]);

  if (!worker) return null;

  const myResponseIds = new Set(responses.map((r) => r.staffing_request_id));
  const openForMe = requests.filter(
    (r) =>
      ["open", "notified", "responses_received"].includes(r.status) &&
      !myResponseIds.has(r.id),
  );
  const myAssignments = assignments.filter(
    (a) => a.worker_user_id === worker.id && a.status !== "completed" && a.status !== "cancelled",
  );

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section style={{ marginTop: 12 }}>
        <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.15 }}>
          Hello, {worker.first_name}.
        </h1>
        <p style={{ margin: "6px 0 0", color: "#496158" }}>
          {openForMe.length > 0
            ? `${openForMe.length} new request${openForMe.length === 1 ? "" : "s"} available.`
            : "No new requests right now."}
        </p>
      </section>

      <Section title="New requests" actionLabel="See all" actionHref="/worker/requests">
        {loading ? (
          <Placeholder>Loading…</Placeholder>
        ) : openForMe.length === 0 ? (
          <Placeholder>You are all caught up.</Placeholder>
        ) : (
          openForMe.slice(0, 3).map((r) => <RequestPreviewCard key={r.id} request={r} />)
        )}
      </Section>

      <Section title="My upcoming shifts" actionLabel="See all" actionHref="/worker/assignments">
        {loading ? (
          <Placeholder>Loading…</Placeholder>
        ) : myAssignments.length === 0 ? (
          <Placeholder>No assigned shifts yet.</Placeholder>
        ) : (
          myAssignments.slice(0, 3).map((a) => {
            const req = requests.find((r) => r.id === a.staffing_request_id);
            if (!req) return null;
            return <AssignmentPreviewCard key={a.id} request={req} assignment={a} />;
          })
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  actionLabel,
  actionHref,
  children,
}: {
  title: string;
  actionLabel?: string;
  actionHref?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</h2>
        {actionHref && actionLabel ? (
          <Link href={actionHref} style={{ color: "#214639", fontSize: 13, fontWeight: 700 }}>
            {actionLabel} →
          </Link>
        ) : null}
      </div>
      <div style={{ display: "grid", gap: 12 }}>{children}</div>
    </section>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
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

function RequestPreviewCard({ request }: { request: StaffingRequest }) {
  return (
    <Link
      href={`/worker/requests`}
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
        background: "#fffdf7",
        borderRadius: 18,
        padding: 18,
        boxShadow: "0 8px 18px rgba(24, 50, 41, 0.08)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
        <strong style={{ fontSize: 17 }}>{request.title}</strong>
        {request.urgency_level >= 3 ? (
          <span
            style={{
              borderRadius: 999,
              padding: "4px 10px",
              background: "#f4d4cc",
              color: "#7a3526",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Urgent
          </span>
        ) : null}
      </div>
      <div style={{ marginTop: 8, color: "#496158", fontSize: 14 }}>
        {request.city} · {request.work_date}
      </div>
      <div style={{ marginTop: 4, color: "#496158", fontSize: 14 }}>
        {request.start_time.slice(0, 5)} – {request.end_time.slice(0, 5)}
      </div>
    </Link>
  );
}

function AssignmentPreviewCard({
  request,
  assignment,
}: {
  request: StaffingRequest;
  assignment: Assignment;
}) {
  return (
    <div
      style={{
        background: "#214639",
        color: "#f7f0df",
        borderRadius: 18,
        padding: 18,
        boxShadow: "0 8px 18px rgba(24, 50, 41, 0.18)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
        <strong style={{ fontSize: 17 }}>{request.title}</strong>
        <span
          style={{
            borderRadius: 999,
            padding: "4px 10px",
            background: "rgba(247, 240, 223, 0.18)",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {assignment.status.replace(/_/g, " ")}
        </span>
      </div>
      <div style={{ marginTop: 8, opacity: 0.85, fontSize: 14 }}>
        {request.city} · {request.work_date}
      </div>
      <div style={{ marginTop: 4, opacity: 0.85, fontSize: 14 }}>
        {request.start_time.slice(0, 5)} – {request.end_time.slice(0, 5)}
      </div>
    </div>
  );
}
