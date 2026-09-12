"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check, Circle, Pencil } from "lucide-react";
import { usePolling } from "../hooks/use-polling";
import { fetchAssignments, fetchRequest, fetchRequestResponses } from "../lib/browser-api";
import type { Assignment, RequestResponse, StaffingRequest, User } from "../lib/types";
import { shiftDateTime } from "../lib/shift-time";
import { Panel } from "./panel";
import { Eyebrow, Mono } from "./ui";

import { CLOSED_STATUSES, isClosedStatus, isEditableStatus, LIVE_STATUSES } from "../lib/request-status";

// Re-exported so existing importers keep one entry point; the sets live in a
// pure module (lib/request-status.ts) that vitest can load.
export { CLOSED_STATUSES, isClosedStatus, LIVE_STATUSES };

const ACTIVE_MS = 5_000;
const IDLE_MS = 30_000;
const OFFLINE_AFTER_FAILURES = 3;

type Snapshot = {
  request: StaffingRequest;
  responses: RequestResponse[];
  assignments: Assignment[];
};

type LiveContextValue = {
  request: StaffingRequest;
  responses: RequestResponse[];
  /** Live assignment (not cancelled/released), or null. */
  assignment: Assignment | null;
  /** Set only when there is no live assignment but a released one exists. */
  releasedAssignment: Assignment | null;
  isLive: boolean;
  lastSuccessAt: number | null;
  offline: boolean;
  refresh: () => void;
};

const LiveContext = createContext<LiveContextValue | null>(null);

/** Null outside a provider so shared components can opt in without coupling. */
export function useRequestLive(): LiveContextValue | null {
  return useContext(LiveContext);
}

function splitAssignments(requestId: string, assignments: Assignment[]) {
  // "released" (giver handed the shift off) is dead like "cancelled" — it
  // must not surface as the current assignee (Finding #1).
  const assignment =
    assignments.find(
      (item) =>
        item.staffing_request_id === requestId &&
        item.status !== "cancelled" &&
        item.status !== "released",
    ) || null;
  const releasedAssignment = assignment
    ? null
    : assignments.find((item) => item.staffing_request_id === requestId && item.status === "released") || null;
  return { assignment, releasedAssignment };
}

export function RequestLiveProvider({
  initialRequest,
  initialResponses,
  initialAssignments,
  children,
}: {
  initialRequest: StaffingRequest;
  initialResponses: RequestResponse[];
  initialAssignments: Assignment[];
  children: ReactNode;
}) {
  const requestId = initialRequest.id;
  const fetcher = useCallback(async (): Promise<Snapshot> => {
    const [request, responses, assignments] = await Promise.all([
      fetchRequest(requestId),
      fetchRequestResponses(requestId),
      fetchAssignments(),
    ]);
    return { request, responses, assignments };
  }, [requestId]);

  const [seed, setSeed] = useState<Snapshot>({
    request: initialRequest,
    responses: initialResponses,
    assignments: initialAssignments,
  });
  // router.refresh() after an action re-renders the server page with fresh
  // props — adopt them so the view never steps backwards to an older poll.
  useEffect(() => {
    setSeed({ request: initialRequest, responses: initialResponses, assignments: initialAssignments });
  }, [initialRequest, initialResponses, initialAssignments]);

  // Read by the hook's isActive() between renders — a ref, not state, so the
  // timer doesn't restart every time the status flips.
  const statusRef = useRef(initialRequest.status);
  const { data, lastSuccessAt, failures, refresh } = usePolling<Snapshot>(fetcher, {
    activeMs: ACTIVE_MS,
    idleMs: IDLE_MS,
    isActive: () => LIVE_STATUSES.has(statusRef.current),
    initialData: seed,
  });

  // Prefer whichever snapshot is newer: a poll result, or server props that
  // arrived after the last poll.
  const [pollStamp, setPollStamp] = useState(0);
  const [seedStamp, setSeedStamp] = useState(0);
  useEffect(() => setPollStamp(Date.now()), [data]);
  useEffect(() => setSeedStamp(Date.now()), [seed]);
  const snapshot: Snapshot = data && pollStamp >= seedStamp ? data : seed;
  statusRef.current = snapshot.request.status;

  const value = useMemo<LiveContextValue>(() => {
    const { assignment, releasedAssignment } = splitAssignments(snapshot.request.id, snapshot.assignments);
    return {
      request: snapshot.request,
      responses: snapshot.responses,
      assignment,
      releasedAssignment,
      isLive: LIVE_STATUSES.has(snapshot.request.status),
      lastSuccessAt,
      offline: failures >= OFFLINE_AFTER_FAILURES,
      refresh,
    };
  }, [snapshot, lastSuccessAt, failures, refresh]);

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

/** Pulsing terra dot + "Live" while a broadcast is in flight. */
export function LiveBadge() {
  const live = useRequestLive();
  const t = useTranslations("admin.live");
  if (!live?.isLive) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "5px 11px",
        borderRadius: 999,
        background: "var(--terra-soft)",
        color: "var(--terra)",
        fontFamily: "var(--ui)",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        verticalAlign: "middle",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 99,
          background: "var(--terra)",
          animation: "sg-pulse 1.4s ease-in-out infinite",
        }}
      />
      {t("live")}
    </span>
  );
}

/** "Updated Xs ago" wired to the last successful fetch, not the last attempt. */
export function UpdatedAgo() {
  const live = useRequestLive();
  const t = useTranslations("admin.live");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!live) return null;
  if (live.offline) {
    return <span style={{ color: "var(--rose)", fontWeight: 600 }}>{t("offline")}</span>;
  }
  if (live.lastSuccessAt == null) return null;
  const seconds = Math.max(0, Math.floor((now - live.lastSuccessAt) / 1000));
  return <span>{seconds < 2 ? t("updatedJustNow") : t("updatedAgo", { n: seconds })}</span>;
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
    { label: "Created", state: "pending" },
    { label: "Notified", state: "pending" },
    { label: "Responses", state: "pending" },
    { label: "Assign", state: "pending" },
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
    steps[2].state = "current";
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
  return steps;
}

export function WorkflowTracker() {
  const live = useRequestLive();
  if (!live) return null;
  const { request, responses, assignment } = live;
  const steps = workflowSteps(
    request.status,
    responses.length > 0,
    assignment != null,
    assignment?.status === "confirmed" || assignment?.status === "completed",
  );
  return (
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
  );
}

function formatStatus(value: string) {
  return value.replace(/_/g, " ");
}

/** Tally cards — every notified worker has a response row, so rows = alerted. */
export function ResponseSummaryPanel() {
  const live = useRequestLive();
  const t = useTranslations("admin.live");
  if (!live) return null;
  const { responses } = live;
  const count = (status: string) => responses.filter((r) => r.status === status).length;
  const stats = [
    { label: t("notified"), value: responses.length, tone: "var(--ink)" },
    { label: "Opened", value: responses.filter((r) => r.viewed_at != null).length, tone: "var(--ink)" },
    { label: t("accepted"), value: count("accepted"), tone: count("accepted") > 0 ? "var(--moss)" : "var(--ink)" },
    { label: "Declined", value: count("declined"), tone: "var(--ink)" },
  ];
  return (
    <Panel title="Response summary" subtitle={<UpdatedAgo />}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 10,
        }}
      >
        {stats.map((stat) => (
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
            <Mono style={{ fontSize: 26, fontWeight: 500, color: stat.tone }}>{stat.value}</Mono>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function AssignmentPanel({ users }: { users: User[] }) {
  const live = useRequestLive();
  if (!live) return null;
  const { assignment, releasedAssignment } = live;
  const assignedWorker = assignment ? users.find((u) => u.id === assignment.worker_user_id) : null;
  const assignedName = assignedWorker ? `${assignedWorker.first_name} ${assignedWorker.last_name}` : "Unknown worker";
  return (
    <Panel title="Assignment">
      {assignment ? (
        <div style={{ display: "grid", gap: 6, color: "var(--ink-2)", fontSize: 13 }}>
          <span>
            <strong style={{ color: "var(--ink)" }}>Substitute:</strong> {assignedName}
          </span>
          <span>
            <strong style={{ color: "var(--ink)" }}>Status:</strong> {formatStatus(assignment.status)}
          </span>
          <span>
            <strong style={{ color: "var(--ink)" }}>Assigned at:</strong> {shiftDateTime(assignment.assigned_at)}
          </span>
          <span>
            <strong style={{ color: "var(--ink)" }}>Notes:</strong> {assignment.notes || "None"}
          </span>
        </div>
      ) : releasedAssignment ? (
        <p style={{ margin: 0, color: "var(--ink-3)", fontSize: 13 }}>
          <strong style={{ color: "var(--ink)" }}>Released</strong> — the substitute
          handed this shift off. It&apos;s being covered through a replacement request.
        </p>
      ) : (
        <p style={{ margin: 0, color: "var(--ink-3)", fontSize: 13 }}>
          No assignment has been confirmed for this request yet.
        </p>
      )}
    </Panel>
  );
}

/** Renders `children` only while the request can still be filled: no live
 * assignment and a non-terminal status (Best-match card). A request can
 * expire while the page is open — the polled status closes the card on the
 * same tick. Outside a provider the server-rendered decision stands. */
export function HideWhenClosed({ children }: { children: ReactNode }) {
  const live = useRequestLive();
  if (live && (live.assignment || isClosedStatus(live.request.status))) return null;
  return <>{children}</>;
}

const PILL_STYLE: React.CSSProperties = {
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
};

/** Header pills ("Edit request", "Rank substitutes →") that follow the
 * polled status: on a page left open they used to stay until a reload after
 * the request expired or got assigned. Outside a provider the server-rendered
 * status decides. */
export function RequestHeaderPills({ requestId, initialStatus }: { requestId: string; initialStatus: string }) {
  const live = useRequestLive();
  const status = live?.request.status ?? initialStatus;
  return (
    <>
      {isEditableStatus(status) ? (
        <Link href={`/admin/requests/${requestId}/edit`} style={PILL_STYLE}>
          <Pencil size={13} strokeWidth={1.8} />
          Edit request
        </Link>
      ) : null}
      {!isClosedStatus(status) ? (
        <Link href={`/admin/substitutes?rank_against_request_id=${requestId}`} style={PILL_STYLE}>
          Rank substitutes →
        </Link>
      ) : null}
    </>
  );
}
