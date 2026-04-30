"use client";

import { useEffect, useState } from "react";
import {
  acceptRequest,
  declineRequest,
  fetchRequestResponses,
  fetchRequests,
} from "../../../lib/browser-api";
import { pickLocale, workerRequestPerspective } from "../../../lib/status-labels";
import { RequestResponse, StaffingRequest } from "../../../lib/types";
import { useWorkerSession } from "../../../lib/worker-session";

type RequestWithMyResponse = {
  request: StaffingRequest;
  myResponse: RequestResponse | null;
};

export default function WorkerRequestsPage() {
  const { worker } = useWorkerSession();
  const [items, setItems] = useState<RequestWithMyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!worker) return;
    setLoading(true);
    setError(null);
    try {
      const all = await fetchRequests();
      const open = all.filter((r) =>
        ["open", "notified", "responses_received"].includes(r.status),
      );
      const responses = await Promise.all(open.map((r) => fetchRequestResponses(r.id)));
      const enriched: RequestWithMyResponse[] = open.map((request, i) => ({
        request,
        myResponse: responses[i].find((res) => res.worker_user_id === worker.id) || null,
      }));
      setItems(enriched);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [worker]);

  if (!worker) return null;
  const locale = pickLocale(worker.preferred_language);

  async function respond(requestId: string, action: "accept" | "decline") {
    if (!worker) return;
    setBusy(requestId);
    setError(null);
    try {
      if (action === "accept") {
        await acceptRequest(requestId, worker.id);
      } else {
        await declineRequest(requestId, worker.id);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  const undecided = items.filter((i) => !i.myResponse || i.myResponse.status === "notified" || i.myResponse.status === "viewed");
  const accepted = items.filter((i) => i.myResponse?.status === "accepted");
  const declined = items.filter((i) => i.myResponse?.status === "declined");

  return (
    <div style={{ display: "grid", gap: 24, paddingTop: 16 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 26 }}>Available requests</h1>
        <p style={{ margin: "6px 0 0", color: "#496158" }}>
          Tap a request to accept or decline.
        </p>
      </header>

      {error ? (
        <div
          style={{
            padding: 14,
            borderRadius: 12,
            background: "#f4d4cc",
            color: "#7a3526",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <p style={{ color: "#496158" }}>Loading…</p>
      ) : (
        <>
          <Group title={`Pending (${undecided.length})`}>
            {undecided.length === 0 ? (
              <Empty>No pending requests.</Empty>
            ) : (
              undecided.map(({ request, myResponse }) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  myResponse={myResponse}
                  myUserId={worker.id}
                  locale={locale}
                  busy={busy === request.id}
                  onAccept={() => respond(request.id, "accept")}
                  onDecline={() => respond(request.id, "decline")}
                />
              ))
            )}
          </Group>

          {accepted.length > 0 ? (
            <Group title={`Accepted (${accepted.length})`}>
              {accepted.map(({ request, myResponse }) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  myResponse={myResponse}
                  myUserId={worker.id}
                  locale={locale}
                  busy={busy === request.id}
                  onDecline={() => respond(request.id, "decline")}
                />
              ))}
            </Group>
          ) : null}

          {declined.length > 0 ? (
            <Group title={`Declined (${declined.length})`}>
              {declined.map(({ request, myResponse }) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  myResponse={myResponse}
                  myUserId={worker.id}
                  locale={locale}
                  busy={busy === request.id}
                  onAccept={() => respond(request.id, "accept")}
                />
              ))}
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

function RequestCard({
  request,
  myResponse,
  myUserId,
  locale,
  busy,
  onAccept,
  onDecline,
}: {
  request: StaffingRequest;
  myResponse: RequestResponse | null;
  myUserId: string;
  locale: "en" | "fr";
  busy: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
}) {
  const perspectiveLabel = workerRequestPerspective(request, myResponse, myUserId, locale);
  return (
    <article
      style={{
        background: "#fffdf7",
        borderRadius: 20,
        padding: 18,
        boxShadow: "0 8px 18px rgba(24, 50, 41, 0.08)",
        display: "grid",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
        <strong style={{ fontSize: 18, lineHeight: 1.2 }}>{request.title}</strong>
        {request.urgency_level >= 3 ? (
          <Badge tone="urgent">Urgent</Badge>
        ) : null}
      </div>

      <div style={{ display: "grid", gap: 4, color: "#3d564c", fontSize: 14 }}>
        <span>📍 {request.location_name ? `${request.location_name}, ${request.city}` : request.city}</span>
        <span>📅 {request.work_date}</span>
        <span>
          🕒 {request.start_time.slice(0, 5)} – {request.end_time.slice(0, 5)}
        </span>
        {request.language_requirement ? (
          <span>🗣 {request.language_requirement.toUpperCase()}</span>
        ) : null}
      </div>

      {request.description ? (
        <p style={{ margin: 0, color: "#3d564c", fontSize: 14, lineHeight: 1.5 }}>
          {request.description}
        </p>
      ) : null}

      {perspectiveLabel ? (
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color:
              myResponse?.status === "accepted"
                ? "#296246"
                : myResponse?.status === "declined"
                ? "#8c4d3f"
                : "#5d6d66",
          }}
        >
          {perspectiveLabel}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {onAccept ? (
          <BigButton tone="primary" disabled={busy} onClick={onAccept}>
            Accept
          </BigButton>
        ) : null}
        {onDecline ? (
          <BigButton tone="muted" disabled={busy} onClick={onDecline}>
            Decline
          </BigButton>
        ) : null}
      </div>
    </article>
  );
}

function BigButton({
  tone,
  disabled,
  onClick,
  children,
}: {
  tone: "primary" | "muted";
  disabled: boolean;
  onClick: () => void;
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
        padding: "16px 18px",
        background: palette.bg,
        color: palette.color,
        fontSize: 16,
        fontWeight: 800,
        letterSpacing: "0.04em",
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

function Badge({ tone, children }: { tone: "urgent"; children: React.ReactNode }) {
  const palette = tone === "urgent" ? { bg: "#f4d4cc", color: "#7a3526" } : null;
  return (
    <span
      style={{
        borderRadius: 999,
        padding: "4px 10px",
        background: palette?.bg,
        color: palette?.color,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}
