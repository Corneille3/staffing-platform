"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import {
  acceptRequest,
  declineRequest,
  fetchRequestEligibility,
  fetchRequestResponses,
  fetchRequests,
  markRequestViewed,
} from "../../../lib/browser-api";
import { pickLocale, workerRequestPerspective } from "../../../lib/status-labels";
import { EligibilityResult, RequestResponse, StaffingRequest } from "../../../lib/types";
import { useWorkerSession } from "../../../lib/worker-session";

type RequestWithMyResponse = {
  request: StaffingRequest;
  myResponse: RequestResponse | null;
  eligibility: EligibilityResult | null;
};

type CoverageTab = "all" | "urgent" | "today" | "week";

const COVERAGE_TABS: { id: CoverageTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "urgent", label: "Urgent" },
  { id: "today", label: "Today" },
  { id: "week", label: "This Week" },
];

export default function WorkerRequestsPage() {
  const { worker } = useWorkerSession();
  const [items, setItems] = useState<RequestWithMyResponse[]>([]);
  const [filledItems, setFilledItems] = useState<StaffingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CoverageTab>("all");
  const [cityFilter, setCityFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [confirmingRequest, setConfirmingRequest] = useState<StaffingRequest | null>(null);
  const [decliningRequest, setDecliningRequest] = useState<StaffingRequest | null>(null);
  const [declineReason, setDeclineReason] = useState<string>("");

  async function load() {
    if (!worker) return;
    setLoading(true);
    setError(null);
    try {
      if (worker.profile?.availability_status !== "available") {
        setItems([]);
        setFilledItems([]);
        return;
      }
      const all = await fetchRequests();
      const open = all.filter((r) =>
        ["open", "notified", "responses_received"].includes(r.status),
      );
      // Assigned requests where this worker was notified (has a response row)
      const assignedToOther = all.filter(
        (r) => r.status === "assigned" && r.assigned_worker_user_id !== worker.id,
      );

      const [responses, eligibilityResults, assignedResponses] = await Promise.all([
        Promise.all(open.map((r) => fetchRequestResponses(r.id))),
        Promise.all(open.map((r) => fetchRequestEligibility(r.id, worker.id).catch(() => null))),
        Promise.all(assignedToOther.map((r) => fetchRequestResponses(r.id))),
      ]);

      const enriched: RequestWithMyResponse[] = open.map((request, i) => ({
        request,
        myResponse: responses[i].find((res) => res.worker_user_id === worker.id) || null,
        eligibility: eligibilityResults[i],
      }));
      setItems(enriched);

      // Only show "filled" notice for requests where the worker had a response
      const filled = assignedToOther.filter((request, i) =>
        assignedResponses[i].some((res) => res.worker_user_id === worker.id),
      );
      setFilledItems(filled);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [worker]);

  const cityOptions = useMemo(
    () => Array.from(new Set(items.map((item) => item.request.city))).sort(),
    [items],
  );
  const filteredItems = useMemo(
    () =>
      items.filter((item) =>
        matchesTab(item.request, activeTab) &&
        matchesCity(item.request, cityFilter) &&
        matchesDate(item.request, dateFilter) &&
        (!urgentOnly || isUrgent(item.request)),
      ),
    [items, activeTab, cityFilter, dateFilter, urgentOnly],
  );

  const undecided = filteredItems.filter((i) => !i.myResponse || i.myResponse.status === "notified" || i.myResponse.status === "viewed");
  const accepted = filteredItems.filter((i) => i.myResponse?.status === "accepted");
  const declined = filteredItems.filter((i) => i.myResponse?.status === "declined");

  if (!worker) return null;
  const locale = pickLocale(worker.preferred_language);
  const canReceiveRequests = worker.profile?.availability_status === "available";

  async function respond(requestId: string, action: "accept" | "decline", reason?: string) {
    if (!worker) return;
    setConfirmingRequest(null);
    setDecliningRequest(null);
    setDeclineReason("");
    setBusy(requestId);
    setError(null);
    try {
      if (action === "accept") {
        await acceptRequest(requestId, worker.id);
      } else {
        await declineRequest(requestId, worker.id, reason || undefined);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 24, paddingTop: 16 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 26 }}>Available requests</h1>
        <p style={{ margin: "6px 0 0", color: "#496158" }}>
          {canReceiveRequests
            ? "Tap a request to accept or decline."
            : "You are unavailable. New request alerts are paused."}
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
      ) : !canReceiveRequests ? (
        <Empty>Set your availability to available to receive new requests.</Empty>
      ) : (
        <>
          <CoverageFilters
            activeTab={activeTab}
            cityFilter={cityFilter}
            cityOptions={cityOptions}
            dateFilter={dateFilter}
            urgentOnly={urgentOnly}
            onTabChange={setActiveTab}
            onCityChange={setCityFilter}
            onDateChange={setDateFilter}
            onUrgentOnlyChange={setUrgentOnly}
            onClear={() => {
              setActiveTab("all");
              setCityFilter("");
              setDateFilter("");
              setUrgentOnly(false);
            }}
          />

          <Group title={`Pending (${undecided.length})`}>
            {undecided.length === 0 ? (
              <Empty>{filteredItems.length === 0 ? "No requests match these filters." : "No pending requests."}</Empty>
            ) : (
              undecided.map(({ request, myResponse, eligibility }) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  myResponse={myResponse}
                  eligibility={eligibility}
                  myUserId={worker.id}
                  locale={locale}
                  busy={busy === request.id}
                  onAccept={() => {
                    if (worker && (!myResponse || myResponse.status === "notified")) {
                      markRequestViewed(request.id, worker.id).catch(() => {});
                    }
                    setConfirmingRequest(request);
                  }}
                  onDecline={() => {
                    if (worker && (!myResponse || myResponse.status === "notified")) {
                      markRequestViewed(request.id, worker.id).catch(() => {});
                    }
                    setDecliningRequest(request);
                  }}
                />
              ))
            )}
          </Group>

          {accepted.length > 0 ? (
            <Group title={`Accepted (${accepted.length})`}>
              {accepted.map(({ request, myResponse, eligibility }) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  myResponse={myResponse}
                  eligibility={eligibility}
                  myUserId={worker.id}
                  locale={locale}
                  busy={busy === request.id}
                  onDecline={() => setDecliningRequest(request)}
                />
              ))}
            </Group>
          ) : null}

          {declined.length > 0 ? (
            <Group title={`Declined (${declined.length})`}>
              {declined.map(({ request, myResponse, eligibility }) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  myResponse={myResponse}
                  eligibility={eligibility}
                  myUserId={worker.id}
                  locale={locale}
                  busy={busy === request.id}
                  onAccept={() => setConfirmingRequest(request)}
                />
              ))}
            </Group>
          ) : null}

          {filledItems.length > 0 ? (
            <Group title={`Filled (${filledItems.length})`}>
              {filledItems.map((request) => (
                <FilledRequestCard key={request.id} request={request} locale={locale} />
              ))}
            </Group>
          ) : null}

          {confirmingRequest ? (
            <ConfirmAvailabilityModal
              request={confirmingRequest}
              busy={busy === confirmingRequest.id}
              onCancel={() => setConfirmingRequest(null)}
              onConfirm={() => respond(confirmingRequest.id, "accept")}
            />
          ) : null}
          {decliningRequest ? (
            <DeclineModal
              request={decliningRequest}
              reason={declineReason}
              busy={busy === decliningRequest.id}
              onReasonChange={setDeclineReason}
              onCancel={() => { setDecliningRequest(null); setDeclineReason(""); }}
              onConfirm={() => respond(decliningRequest.id, "decline", declineReason || undefined)}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function CoverageFilters({
  activeTab,
  cityFilter,
  cityOptions,
  dateFilter,
  urgentOnly,
  onTabChange,
  onCityChange,
  onDateChange,
  onUrgentOnlyChange,
  onClear,
}: {
  activeTab: CoverageTab;
  cityFilter: string;
  cityOptions: string[];
  dateFilter: string;
  urgentOnly: boolean;
  onTabChange: (tab: CoverageTab) => void;
  onCityChange: (city: string) => void;
  onDateChange: (date: string) => void;
  onUrgentOnlyChange: (urgentOnly: boolean) => void;
  onClear: () => void;
}) {
  const hasFilters = activeTab !== "all" || cityFilter || dateFilter || urgentOnly;

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 8,
        }}
      >
        {COVERAGE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            aria-pressed={activeTab === tab.id}
            style={{
              minHeight: 44,
              border: activeTab === tab.id ? "1px solid #214639" : "1px solid rgba(24, 50, 41, 0.16)",
              borderRadius: 12,
              background: activeTab === tab.id ? "#214639" : "#fffdf7",
              color: activeTab === tab.id ? "#f7f0df" : "#214639",
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 10,
        }}
      >
        <label style={{ display: "grid", gap: 6, color: "#496158", fontSize: 13, fontWeight: 800 }}>
          City
          <select
            value={cityFilter}
            onChange={(event) => onCityChange(event.target.value)}
            style={filterInputStyle}
          >
            <option value="">Any city</option>
            {cityOptions.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: 6, color: "#496158", fontSize: 13, fontWeight: 800 }}>
          Date
          <input
            type="date"
            value={dateFilter}
            onChange={(event) => onDateChange(event.target.value)}
            style={filterInputStyle}
          />
        </label>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "#314c42",
            fontSize: 14,
            fontWeight: 800,
          }}
        >
          <input
            type="checkbox"
            checked={urgentOnly}
            onChange={(event) => onUrgentOnlyChange(event.target.checked)}
            style={{ width: 18, height: 18, accentColor: "#214639" }}
          />
          Urgent only
        </label>

        {hasFilters ? (
          <button
            type="button"
            onClick={onClear}
            style={{
              border: 0,
              background: "transparent",
              color: "#214639",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 800,
              padding: "8px 0",
            }}
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </section>
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
  eligibility,
  myUserId,
  locale,
  busy,
  onAccept,
  onDecline,
}: {
  request: StaffingRequest;
  myResponse: RequestResponse | null;
  eligibility: EligibilityResult | null;
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
        {request.coverage_type ? (
          <Badge tone={request.coverage_type === "emergency" || request.coverage_type === "same_day_urgent" ? "urgent" : "neutral"}>
            {coverageTypeLabel(request.coverage_type, locale)}
          </Badge>
        ) : request.urgency_level >= 3 ? (
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

      {eligibility ? <EligibilityChips eligibility={eligibility} /> : null}

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

      {myResponse?.status === "accepted" ? (
        <p style={{ margin: 0, color: "#296246", fontSize: 14, fontWeight: 800 }}>
          {request.status === "responses_received"
            ? locale === "fr"
              ? "Réponse reçue par le coordonnateur · En attente de confirmation."
              : "Response received by coordinator · Awaiting confirmation."
            : locale === "fr"
            ? "Réponse envoyée · En attente de confirmation du coordonnateur."
            : "Response sent · Awaiting coordinator confirmation."}
        </p>
      ) : myResponse?.status === "declined" && myResponse.decline_reason ? (
        <p style={{ margin: 0, color: "#8c4d3f", fontSize: 13 }}>
          Reason: {myResponse.decline_reason}
        </p>
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

function FilledRequestCard({
  request,
  locale,
}: {
  request: StaffingRequest;
  locale: "en" | "fr";
}) {
  const notice =
    locale === "fr"
      ? "Ce remplacement a été pourvu. Un·e autre remplaçant·e a été confirmé·e."
      : "This request has been filled. Another substitute was confirmed.";
  return (
    <article
      style={{
        background: "#f5f5f3",
        borderRadius: 20,
        padding: 18,
        display: "grid",
        gap: 10,
        opacity: 0.85,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
        <strong style={{ fontSize: 16, color: "#5d6d66", lineHeight: 1.2 }}>{request.title}</strong>
        <span
          style={{
            borderRadius: 999,
            padding: "4px 10px",
            background: "#e8e8e5",
            color: "#5d6d66",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {locale === "fr" ? "Pourvu" : "Filled"}
        </span>
      </div>
      <div style={{ display: "grid", gap: 4, color: "#7d8f87", fontSize: 14 }}>
        <span>📍 {request.location_name ? `${request.location_name}, ${request.city}` : request.city}</span>
        <span>📅 {request.work_date}</span>
        <span>🕒 {request.start_time.slice(0, 5)} – {request.end_time.slice(0, 5)}</span>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: "#5d6d66",
          fontStyle: "italic",
          lineHeight: 1.45,
        }}
      >
        {notice}
      </p>
    </article>
  );
}

function EligibilityChips({ eligibility }: { eligibility: EligibilityResult }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {eligibility.reasons.map((reason, index) => (
        <span
          key={`${reason.type}-${reason.code || index}`}
          style={{
            borderRadius: 999,
            padding: "6px 10px",
            background: reason.status === "matched" ? "#e2f1e8" : "#f4d4cc",
            color: reason.status === "matched" ? "#296246" : "#7a3526",
            fontSize: 12,
            fontWeight: 800,
            lineHeight: 1.1,
          }}
        >
          {reason.label}
        </span>
      ))}
    </div>
  );
}

function ConfirmAvailabilityModal({
  request,
  busy,
  onCancel,
  onConfirm,
}: {
  request: StaffingRequest;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-availability-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(24, 50, 41, 0.34)",
        display: "flex",
        alignItems: "end",
        justifyContent: "center",
        padding: 16,
        zIndex: 30,
      }}
    >
      <section
        style={{
          width: "min(100%, 440px)",
          background: "#fffdf7",
          color: "#183229",
          borderRadius: 20,
          padding: 20,
          boxShadow: "0 18px 42px rgba(24, 50, 41, 0.24)",
          display: "grid",
          gap: 16,
        }}
      >
        <div>
          <h2 id="confirm-availability-title" style={{ margin: 0, fontSize: 22 }}>
            Confirm availability
          </h2>
          <p style={{ margin: "8px 0 0", color: "#496158", lineHeight: 1.45 }}>
            Confirm you are available for this coverage request. Your response will be sent to the
            coordinator for final confirmation.
          </p>
        </div>

        <div
          style={{
            borderRadius: 16,
            background: "#f3eadb",
            padding: 14,
            display: "grid",
            gap: 6,
            color: "#314c42",
            fontSize: 14,
          }}
        >
          <strong style={{ color: "#183229", fontSize: 16 }}>{request.title}</strong>
          <span>{request.city} · {request.work_date}</span>
          <span>{request.start_time.slice(0, 5)} - {request.end_time.slice(0, 5)}</span>
        </div>

        <p style={{ margin: 0, color: "#496158", fontSize: 14, fontWeight: 800 }}>
          This sends your response only. The assignment is confirmed by the coordinator.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <BigButton tone="muted" disabled={busy} onClick={onCancel}>
            Go back
          </BigButton>
          <BigButton tone="primary" disabled={busy} onClick={onConfirm}>
            Confirm
          </BigButton>
        </div>
      </section>
    </div>
  );
}

const DECLINE_REASONS = [
  "Not available",
  "Too far",
  "Not interested",
  "Conflict with another assignment",
  "Other",
];

function DeclineModal({
  request,
  reason,
  busy,
  onReasonChange,
  onCancel,
  onConfirm,
}: {
  request: StaffingRequest;
  reason: string;
  busy: boolean;
  onReasonChange: (reason: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="decline-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(24, 50, 41, 0.34)",
        display: "flex",
        alignItems: "end",
        justifyContent: "center",
        padding: 16,
        zIndex: 30,
      }}
    >
      <section
        style={{
          width: "min(100%, 440px)",
          background: "#fffdf7",
          color: "#183229",
          borderRadius: 20,
          padding: 20,
          boxShadow: "0 18px 42px rgba(24, 50, 41, 0.24)",
          display: "grid",
          gap: 16,
        }}
      >
        <div>
          <h2 id="decline-title" style={{ margin: 0, fontSize: 22 }}>
            Decline request
          </h2>
          <p style={{ margin: "8px 0 0", color: "#496158", lineHeight: 1.45 }}>
            {request.title} · {request.city} · {request.work_date}
          </p>
        </div>

        <label style={{ display: "grid", gap: 8, fontWeight: 700, color: "#314c42" }}>
          Reason <span style={{ fontWeight: 400, fontSize: 13, color: "#5d6d66" }}>(optional)</span>
          <select
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            style={{
              border: "1px solid rgba(24, 50, 41, 0.16)",
              borderRadius: 12,
              background: "#fff",
              color: "#183229",
              fontSize: 15,
              minHeight: 44,
              padding: "0 12px",
              font: "inherit",
            }}
          >
            <option value="">No reason provided</option>
            {DECLINE_REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <BigButton tone="muted" disabled={busy} onClick={onCancel}>
            Go back
          </BigButton>
          <BigButton tone="decline" disabled={busy} onClick={onConfirm}>
            Decline
          </BigButton>
        </div>
      </section>
    </div>
  );
}

function BigButton({
  tone,
  disabled,
  onClick,
  children,
}: {
  tone: "primary" | "muted" | "decline";
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const palette =
    tone === "primary"
      ? { bg: "#214639", color: "#f7f0df" }
      : tone === "decline"
      ? { bg: "#7a3526", color: "#fffdf7" }
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

function coverageTypeLabel(type: string, locale: "en" | "fr"): string {
  const map: Record<string, { en: string; fr: string }> = {
    same_day_urgent: { en: "Same-day urgent", fr: "Urgent même jour" },
    planned_absence: { en: "Planned absence", fr: "Absence planifiée" },
    recurring:       { en: "Recurring",       fr: "Récurrent" },
    emergency:       { en: "Emergency",       fr: "Urgence" },
  };
  return map[type]?.[locale] ?? type;
}

function Badge({ tone, children }: { tone: "urgent" | "neutral"; children: React.ReactNode }) {
  const palette =
    tone === "urgent"
      ? { bg: "#f4d4cc", color: "#7a3526" }
      : { bg: "#e2ebdd", color: "#214639" };
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

const filterInputStyle: CSSProperties = {
  border: "1px solid rgba(24, 50, 41, 0.16)",
  borderRadius: 12,
  background: "#fffdf7",
  color: "#183229",
  fontSize: 15,
  minHeight: 44,
  padding: "0 12px",
};

function matchesTab(request: StaffingRequest, tab: CoverageTab): boolean {
  if (tab === "urgent") return isUrgent(request);
  if (tab === "today") return request.work_date === todayString();
  if (tab === "week") return isWithinThisWeek(request.work_date);
  return true;
}

function matchesCity(request: StaffingRequest, city: string): boolean {
  if (!city) return true;
  return request.city === city;
}

function matchesDate(request: StaffingRequest, date: string): boolean {
  if (!date) return true;
  return request.work_date === date;
}

function isUrgent(request: StaffingRequest): boolean {
  return request.urgency_level >= 3;
}

function isWithinThisWeek(dateValue: string): boolean {
  const target = parseDateOnly(dateValue).getTime();
  const today = parseDateOnly(todayString());
  const end = new Date(today);
  end.setDate(today.getDate() + 6);
  return target >= today.getTime() && target <= end.getTime();
}

function todayString(): string {
  const today = new Date();
  return toDateInputValue(today);
}

function parseDateOnly(dateValue: string): Date {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
