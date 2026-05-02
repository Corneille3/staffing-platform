"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  fetchAssignments,
  fetchRequestResponses,
  fetchRequests,
  updateWorkerPreferences,
} from "../../lib/browser-api";
import { assignmentStatusLabel, availabilityStatusLabel, pickLocale } from "../../lib/status-labels";
import { Assignment, RequestResponse, StaffingRequest } from "../../lib/types";
import { useWorkerSession } from "../../lib/worker-session";

export default function WorkerHome() {
  const { worker, refresh } = useWorkerSession();
  const [requests, setRequests] = useState<StaffingRequest[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [responses, setResponses] = useState<RequestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [preferenceBusy, setPreferenceBusy] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);

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

  const openForMe = requests.filter(
    (request) => ["open", "notified", "responses_received"].includes(request.status),
  );
  const urgentRequests = openForMe
    .filter((request) => request.urgency_level >= 3)
    .sort(compareRequestsByStart);
  const nearbyCoverage = openForMe
    .filter((request) => request.urgency_level < 3)
    .sort(compareRequestsByStart);
  const myAssignments = assignments.filter(
    (a) => a.worker_user_id === worker.id && a.status !== "completed" && a.status !== "cancelled",
  );
  const upcomingAssignment = myAssignments
    .map((assignment) => ({
      assignment,
      request: requests.find((request) => request.id === assignment.staffing_request_id) || null,
    }))
    .filter((item): item is { assignment: Assignment; request: StaffingRequest } => Boolean(item.request))
    .sort((left, right) => compareRequestsByStart(left.request, right.request))[0] || null;
  const workerId = worker.id;
  const locale = pickLocale(worker.preferred_language);
  const availabilityStatus = worker.profile?.availability_status || "unavailable";
  const urgentAlertsEnabled = worker.profile?.urgent_alert_opt_in ?? false;

  async function updatePreferences(payload: {
    availability_status?: "available" | "unavailable";
    urgent_alert_opt_in?: boolean;
  }) {
    setPreferenceBusy(true);
    setPreferenceError(null);
    try {
      await updateWorkerPreferences(workerId, payload);
      await refresh();
    } catch (err) {
      setPreferenceError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setPreferenceBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <HomeTopCard
        firstName={worker.first_name}
        availabilityStatus={availabilityStatus}
        urgentAlertsEnabled={urgentAlertsEnabled}
        locale={locale}
        busy={preferenceBusy}
        error={preferenceError}
        openRequestCount={openForMe.length}
        onSetUnavailable={() => updatePreferences({ availability_status: "unavailable" })}
        onToggleUrgentAlerts={() =>
          updatePreferences({ urgent_alert_opt_in: !urgentAlertsEnabled })
        }
      />

      <Section title="Urgent Requests" actionLabel="See all" actionHref="/worker/requests">
        {loading ? (
          <Placeholder>Loading…</Placeholder>
        ) : urgentRequests.length === 0 ? (
          <Placeholder>No urgent requests right now.</Placeholder>
        ) : (
          urgentRequests.slice(0, 2).map((request) => (
            <RequestPreviewCard key={request.id} request={request} emphasis="urgent" />
          ))
        )}
      </Section>

      <Section title="Available Coverage Near You" actionLabel="Browse all" actionHref="/worker/requests">
        {loading ? (
          <Placeholder>Loading…</Placeholder>
        ) : nearbyCoverage.length === 0 ? (
          <Placeholder>No nearby coverage requests right now.</Placeholder>
        ) : (
          nearbyCoverage.slice(0, 3).map((request) => (
            <RequestPreviewCard key={request.id} request={request} />
          ))
        )}
      </Section>

      <Section title="Upcoming Assignment" actionLabel="See all" actionHref="/worker/assignments">
        {loading ? (
          <Placeholder>Loading…</Placeholder>
        ) : !upcomingAssignment ? (
          <Placeholder>No assigned shift yet.</Placeholder>
        ) : (
          <AssignmentPreviewCard
            request={upcomingAssignment.request}
            assignment={upcomingAssignment.assignment}
            locale={locale}
          />
        )}
      </Section>
    </div>
  );
}

function HomeTopCard({
  firstName,
  availabilityStatus,
  urgentAlertsEnabled,
  locale,
  busy,
  error,
  openRequestCount,
  onSetUnavailable,
  onToggleUrgentAlerts,
}: {
  firstName: string;
  availabilityStatus: string;
  urgentAlertsEnabled: boolean;
  locale: "en" | "fr";
  busy: boolean;
  error: string | null;
  openRequestCount: number;
  onSetUnavailable: () => void;
  onToggleUrgentAlerts: () => void;
}) {
  const available = availabilityStatus === "available";

  return (
    <section
      style={{
        marginTop: 12,
        background: "#fffdf7",
        borderRadius: 22,
        padding: 20,
        boxShadow: "0 8px 18px rgba(24, 50, 41, 0.08)",
        display: "grid",
        gap: 18,
      }}
    >
      <div>
        <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.15 }}>
          Hello, {firstName}.
        </h1>
        <p style={{ margin: "6px 0 0", color: "#496158" }}>
          {openRequestCount > 0
            ? `${openRequestCount} new request${openRequestCount === 1 ? "" : "s"} available.`
            : "No new requests right now."}
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        <StatusPill
          label="Availability"
          value={availabilityStatusLabel(availabilityStatus, locale)}
          tone={available ? "good" : "muted"}
        />
        <StatusPill
          label="Urgent alerts"
          value={urgentAlertsEnabled ? "On" : "Off"}
          tone={urgentAlertsEnabled ? "good" : "muted"}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <QuickButton
          disabled={busy || !available}
          onClick={onSetUnavailable}
          tone="muted"
        >
          Set unavailable
        </QuickButton>
        <QuickButton
          disabled={busy}
          onClick={onToggleUrgentAlerts}
          tone={urgentAlertsEnabled ? "muted" : "primary"}
        >
          {urgentAlertsEnabled ? "Turn alerts off" : "Turn alerts on"}
        </QuickButton>
        <QuickLink href="/worker/availability">Update availability</QuickLink>
        <QuickLink href="/worker/requests">View available coverage</QuickLink>
      </div>

      {error ? <p style={{ margin: 0, color: "#7a3526", fontWeight: 800 }}>{error}</p> : null}
    </section>
  );
}

function StatusPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "muted";
}) {
  const palette =
    tone === "good"
      ? { bg: "#e2f1e8", color: "#214639" }
      : { bg: "#eadfd7", color: "#7a473f" };

  return (
    <div
      style={{
        borderRadius: 16,
        background: palette.bg,
        color: palette.color,
        padding: 14,
        display: "grid",
        gap: 4,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {label}
      </span>
      <strong style={{ fontSize: 16 }}>{value}</strong>
    </div>
  );
}

function QuickButton({
  disabled,
  onClick,
  tone,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  tone: "primary" | "muted";
  children: React.ReactNode;
}) {
  const palette =
    tone === "primary"
      ? { bg: "#214639", color: "#f7f0df" }
      : { bg: "#eadfd7", color: "#7a473f" };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        border: 0,
        borderRadius: 14,
        minHeight: 48,
        padding: "12px 14px",
        background: palette.bg,
        color: palette.color,
        fontSize: 14,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.58 : 1,
      }}
    >
      {children}
    </button>
  );
}

function QuickLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        borderRadius: 14,
        minHeight: 48,
        padding: "12px 14px",
        background: "#dbe4dd",
        color: "#214639",
        fontSize: 14,
        fontWeight: 800,
        textDecoration: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
      }}
    >
      {children}
    </Link>
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

function RequestPreviewCard({
  request,
  emphasis = "normal",
}: {
  request: StaffingRequest;
  emphasis?: "normal" | "urgent";
}) {
  const urgent = request.urgency_level >= 3;
  return (
    <Link
      href={`/worker/requests`}
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
        background: emphasis === "urgent" ? "#f8e6df" : "#fffdf7",
        borderRadius: 18,
        padding: 18,
        border: emphasis === "urgent" ? "1px solid rgba(122, 53, 38, 0.18)" : "1px solid transparent",
        boxShadow: emphasis === "urgent" ? "0 8px 18px rgba(122, 53, 38, 0.1)" : "0 8px 18px rgba(24, 50, 41, 0.08)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
        <strong style={{ fontSize: 17 }}>{request.title}</strong>
        {urgent ? (
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
  locale,
}: {
  request: StaffingRequest;
  assignment: Assignment;
  locale: "en" | "fr";
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
          {assignmentStatusLabel(assignment.status, locale)}
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

function compareRequestsByStart(left: StaffingRequest, right: StaffingRequest): number {
  return requestStartTime(left) - requestStartTime(right);
}

function requestStartTime(request: StaffingRequest): number {
  return new Date(`${request.work_date}T${request.start_time}`).getTime();
}
