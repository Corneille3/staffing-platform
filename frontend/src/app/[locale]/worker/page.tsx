"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Calendar, MapPin } from "lucide-react";
import {
  fetchAssignments,
  fetchRequestResponses,
  fetchRequests,
  updateWorkerPreferences,
} from "../../../lib/browser-api";
import { pickLocale } from "../../../lib/status-labels";
import { Assignment, RequestResponse, StaffingRequest } from "../../../lib/types";
import { useWorkerSession } from "../../../lib/worker-session";
import { Avatar, Chip, Meta, Mono } from "../../../components/ui";

type CardStatus = "new" | "sent" | "filled";

interface InboxItem {
  request: StaffingRequest;
  status: CardStatus;
}

export default function WorkerHome() {
  const { worker, refresh } = useWorkerSession();
  const [requests, setRequests] = useState<StaffingRequest[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [responses, setResponses] = useState<RequestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active" | "history">("active");
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
    return () => { alive = false; };
  }, [worker]);

  if (!worker) return null;

  const locale = pickLocale(worker.preferred_language);
  const availabilityStatus = worker.profile?.availability_status || "unavailable";
  const available = availabilityStatus === "available";
  const urgentAlertsEnabled = worker.profile?.urgent_alert_opt_in ?? false;

  const inboxItems: InboxItem[] = requests.map((req) => {
    const myResponse = responses.find((r) => r.staffing_request_id === req.id);
    let status: CardStatus = "new";
    if (["assigned", "completed", "cancelled", "expired"].includes(req.status)) {
      status = "filled";
    } else if (myResponse && ["accepted", "viewed"].includes(myResponse.status)) {
      status = "sent";
    }
    return { request: req, status };
  });

  const activeItems = inboxItems.filter((i) => i.status !== "filled");
  const historyItems = inboxItems.filter((i) => i.status === "filled");
  const displayed = tab === "active" ? activeItems : historyItems;

  const firstName = worker.first_name;
  const hour = new Date().getHours();
  const greeting =
    locale === "fr"
      ? hour < 12 ? "Bonjour" : hour < 18 ? "Bonsoir" : "Bonsoir"
      : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  async function toggleAvailability() {
    if (!worker) return;
    setPreferenceBusy(true);
    setPreferenceError(null);
    try {
      await updateWorkerPreferences(worker.id, {
        availability_status: available ? "unavailable" : "available",
      });
      await refresh();
    } catch (err) {
      setPreferenceError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setPreferenceBusy(false);
    }
  }

  return (
    <div style={{ paddingTop: 24 }}>
      {/* Greeting header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: ".14em", textTransform: "uppercase", fontWeight: 500 }}>
            {greeting}, {firstName}
          </div>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 30, lineHeight: 1.05, margin: "4px 0 0" }}>
            {locale === "fr"
              ? <>Vos <em style={{ fontStyle: "italic" }}>opportunités</em></>
              : <>Today's <em style={{ fontStyle: "italic" }}>opportunities</em></>}
          </h1>
        </div>
        <Avatar
          initials={`${worker.first_name[0]}${worker.last_name[0]}`}
          tone="terra"
          size={38}
        />
      </div>

      {/* Availability strip */}
      <button
        onClick={toggleAvailability}
        disabled={preferenceBusy}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          background: available ? "var(--moss-soft)" : "var(--paper-2)",
          border: `0.5px solid ${available ? "#C8DCC1" : "var(--line)"}`,
          borderRadius: 14,
          marginBottom: 20,
          cursor: "pointer",
          fontFamily: "var(--ui)",
          textAlign: "left",
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: 99,
            background: available ? "var(--moss)" : "var(--ink-4)",
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, fontSize: 13, color: available ? "var(--moss)" : "var(--ink-3)", fontWeight: 500 }}>
          {available
            ? (locale === "fr" ? "Disponible aujourd'hui" : "Available today")
            : (locale === "fr" ? "Indisponible" : "Unavailable")}
        </div>
        <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {locale === "fr" ? "Modifier" : "Edit"}
        </span>
      </button>

      {preferenceError && (
        <p style={{ margin: "-12px 0 16px", fontSize: 12, color: "var(--rose)" }}>{preferenceError}</p>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 12, borderBottom: "0.5px solid var(--line)" }}>
        {(["active", "history"] as const).map((t) => {
          const count = t === "active" ? activeItems.length : historyItems.length;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                border: "none",
                background: "transparent",
                padding: "8px 0",
                marginRight: 20,
                fontFamily: "var(--ui)",
                fontSize: 14,
                fontWeight: tab === t ? 600 : 400,
                color: tab === t ? "var(--ink)" : "var(--ink-3)",
                borderBottom: tab === t ? "1.5px solid var(--ink)" : "1.5px solid transparent",
                marginBottom: -1,
                cursor: "pointer",
              }}
            >
              {t === "active"
                ? (locale === "fr" ? "Actif" : "Active")
                : (locale === "fr" ? "Historique" : "History")}
              {" "}
              <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Request list */}
      {loading ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>
          {locale === "fr" ? "Chargement…" : "Loading…"}
        </div>
      ) : displayed.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>
          {tab === "active"
            ? (locale === "fr" ? "Aucune demande active." : "No active requests.")
            : (locale === "fr" ? "Aucun historique." : "Nothing in history yet.")}
        </div>
      ) : (
        displayed.map(({ request, status }) => (
          <RequestCard key={request.id} request={request} status={status} locale={locale} />
        ))
      )}

      <div style={{ textAlign: "center", padding: "20px 0 8px", color: "var(--ink-4)", fontSize: 12 }}>
        {locale === "fr" ? "C'est tout pour l'instant." : "That's all for now."}
      </div>
    </div>
  );
}

function RequestCard({
  request,
  status,
  locale,
}: {
  request: StaffingRequest;
  status: CardStatus;
  locale: "en" | "fr";
}) {
  const urgent = request.urgency_level >= 3;
  const timeAgo = formatTimeAgo(request.created_at, locale);

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 18,
        padding: "14px 16px",
        marginBottom: 10,
        border: `0.5px solid ${urgent ? "#F2C5B0" : "var(--line)"}`,
        boxShadow: urgent
          ? "0 1px 0 rgba(220,90,42,.04), 0 8px 24px -16px rgba(220,90,42,.18)"
          : "none",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {urgent && (
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "var(--terra)" }} />
      )}

      {/* Top row: chips + time */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {urgent && <Chip variant="urgent" dot>{locale === "fr" ? "Urgent" : "Urgent"}</Chip>}
          {status === "new"    && <Chip variant="terra" dot>{locale === "fr" ? "Nouvelle demande" : "New request"}</Chip>}
          {status === "sent"   && <Chip variant="sand"  dot>{locale === "fr" ? "Réponse envoyée" : "Reply sent"}</Chip>}
          {status === "filled" && <Chip variant="default" style={{ color: "var(--ink-3)" }}>{locale === "fr" ? "Pourvu" : "Filled"}</Chip>}
        </div>
        <Mono style={{ fontSize: 10, color: "var(--ink-3)" }}>{timeAgo}</Mono>
      </div>

      {/* Org name */}
      <div style={{ fontFamily: "var(--serif)", fontSize: 22, lineHeight: 1.15, marginBottom: 2 }}>
        {request.title}
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: 10 }}>
        {request.city}
      </div>

      {/* Meta grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
        <Meta
          icon={<Calendar size={13} />}
          label={request.work_date}
          sub={`${request.start_time.slice(0, 5)} → ${request.end_time.slice(0, 5)}`}
        />
        <Meta
          icon={<MapPin size={13} />}
          label={request.city}
        />
      </div>

      {/* CTAs */}
      {status === "new" && (
        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href={`/worker/requests`}
            style={{
              flex: 1,
              padding: "11px 0",
              borderRadius: 12,
              background: "var(--ink)",
              color: "var(--paper)",
              fontSize: 14,
              fontWeight: 500,
              textAlign: "center",
              textDecoration: "none",
              fontFamily: "var(--ui)",
            }}
          >
            {locale === "fr" ? "Je peux le prendre" : "I can take it"}
          </Link>
          <Link
            href={`/worker/requests`}
            style={{
              padding: "11px 14px",
              borderRadius: 12,
              border: "0.5px solid var(--line)",
              background: "transparent",
              color: "var(--ink)",
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "none",
              fontFamily: "var(--ui)",
            }}
          >
            {locale === "fr" ? "Refuser" : "Decline"}
          </Link>
        </div>
      )}

      {status === "sent" && (
        <div
          style={{
            padding: "11px 0",
            textAlign: "center",
            color: "var(--ink-3)",
            fontSize: 13,
            border: "0.5px dashed var(--line)",
            borderRadius: 12,
          }}
        >
          {locale === "fr" ? "En attente de confirmation" : "Waiting for confirmation"}
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(createdAt: string | undefined, locale: "en" | "fr"): string {
  if (!createdAt) return "";
  const diff = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return locale === "fr" ? `${mins} min` : `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return locale === "fr" ? `${hours} h` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return locale === "fr" ? `${days} j` : `${days}d ago`;
}

function compareRequestsByStart(left: StaffingRequest, right: StaffingRequest): number {
  return requestStartTime(left) - requestStartTime(right);
}

function requestStartTime(request: StaffingRequest): number {
  return new Date(`${request.work_date}T${request.start_time}`).getTime();
}
