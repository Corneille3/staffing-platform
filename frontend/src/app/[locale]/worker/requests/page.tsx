"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { Calendar, MapPin, Check, X, AlertTriangle } from "lucide-react";
import {
  acceptRequest,
  declineRequest,
  fetchRequestEligibility,
  fetchRequestResponses,
  fetchRequests,
  markRequestViewed,
} from "../../../../lib/browser-api";
import { pickLocale, workerRequestPerspective } from "../../../../lib/status-labels";
import { EligibilityResult, RequestResponse, StaffingRequest } from "../../../../lib/types";
import { useWorkerSession } from "../../../../lib/worker-session";
import { Chip, Eyebrow, Meta, Mono } from "../../../../components/ui";

type RequestWithMyResponse = {
  request: StaffingRequest;
  myResponse: RequestResponse | null;
  eligibility: EligibilityResult | null;
};

type CoverageTab = "all" | "urgent" | "today" | "week";

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
      enriched
        .filter((item) => item.myResponse?.status === "notified")
        .forEach((item) => markRequestViewed(item.request.id, worker.id).catch(() => {}));
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

  useEffect(() => { load(); }, [worker]);

  const cityOptions = useMemo(
    () => Array.from(new Set(items.map((item) => item.request.city))).sort(),
    [items],
  );
  const filteredItems = useMemo(
    () => items.filter((item) =>
      matchesTab(item.request, activeTab) &&
      matchesCity(item.request, cityFilter) &&
      matchesDate(item.request, dateFilter) &&
      (!urgentOnly || isUrgent(item.request)),
    ),
    [items, activeTab, cityFilter, dateFilter, urgentOnly],
  );

  const undecided = filteredItems.filter((i) => !i.myResponse || ["notified", "viewed"].includes(i.myResponse.status));
  const accepted  = filteredItems.filter((i) => i.myResponse?.status === "accepted");
  const declined  = filteredItems.filter((i) => i.myResponse?.status === "declined");

  if (!worker) return null;
  const locale = pickLocale(worker.preferred_language);
  const canReceive = worker.profile?.availability_status === "available";
  const hasFilters = activeTab !== "all" || cityFilter || dateFilter || urgentOnly;

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
    <div style={{ paddingTop: 24 }}>
      {/* Heading */}
      <div style={{ marginBottom: 20 }}>
        <Eyebrow style={{ marginBottom: 4 }}>
          {locale === "fr" ? "Remplacements disponibles" : "Available coverage"}
        </Eyebrow>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 30, lineHeight: 1.05, margin: 0 }}>
          {locale === "fr"
            ? <>Trouvez un <em style={{ fontStyle: "italic" }}>remplacement</em></>
            : <>Find a <em style={{ fontStyle: "italic" }}>shift</em></>}
        </h1>
      </div>

      {error && (
        <div style={{ padding: "12px 14px", borderRadius: 12, background: "var(--rose-soft)", color: "var(--rose)", fontSize: 14, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {!canReceive ? (
        <div style={{ padding: "20px 16px", borderRadius: 16, background: "#fff", border: "0.5px solid var(--line)", textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "var(--ink-3)", lineHeight: 1.6 }}>
            {locale === "fr"
              ? "Vous êtes indisponible. Mettez-vous disponible pour recevoir des demandes."
              : "You are unavailable. Set your availability to receive new requests."}
          </div>
        </div>
      ) : loading ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>
          {locale === "fr" ? "Chargement…" : "Loading…"}
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", paddingBottom: 2 }}>
            {(["all", "urgent", "today", "week"] as CoverageTab[]).map((tab) => {
              const labels: Record<CoverageTab, { en: string; fr: string }> = {
                all:    { en: "All",       fr: "Tous" },
                urgent: { en: "Urgent",    fr: "Urgent" },
                today:  { en: "Today",     fr: "Aujourd'hui" },
                week:   { en: "This Week", fr: "Cette semaine" },
              };
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    flexShrink: 0,
                    border: activeTab === tab ? "none" : "0.5px solid var(--line)",
                    borderRadius: 999,
                    padding: "8px 16px",
                    background: activeTab === tab ? "var(--ink)" : "#fff",
                    color: activeTab === tab ? "var(--paper)" : "var(--ink-2)",
                    fontSize: 13,
                    fontWeight: activeTab === tab ? 600 : 400,
                    cursor: "pointer",
                    fontFamily: "var(--ui)",
                    minHeight: 36,
                  }}
                >
                  {labels[tab][locale]}
                </button>
              );
            })}
          </div>

          {/* Filters row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              style={inputStyle}
            >
              <option value="">{locale === "fr" ? "Toutes les villes" : "Any city"}</option>
              {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-2)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={urgentOnly}
                onChange={(e) => setUrgentOnly(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "var(--terra)" }}
              />
              {locale === "fr" ? "Urgent seulement" : "Urgent only"}
            </label>
            {hasFilters && (
              <button
                onClick={() => { setActiveTab("all"); setCityFilter(""); setDateFilter(""); setUrgentOnly(false); }}
                style={{ border: "none", background: "transparent", color: "var(--ink-3)", fontSize: 13, cursor: "pointer", fontFamily: "var(--ui)" }}
              >
                {locale === "fr" ? "Effacer" : "Clear filters"}
              </button>
            )}
          </div>

          {/* Pending group */}
          <Group label={locale === "fr" ? `En attente (${undecided.length})` : `Pending (${undecided.length})`}>
            {undecided.length === 0 ? (
              <Empty>{locale === "fr" ? "Aucune demande en attente." : "No pending requests."}</Empty>
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
                  onAccept={() => setConfirmingRequest(request)}
                  onDecline={() => setDecliningRequest(request)}
                />
              ))
            )}
          </Group>

          {accepted.length > 0 && (
            <Group label={locale === "fr" ? `Accepté (${accepted.length})` : `Accepted (${accepted.length})`}>
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
          )}

          {declined.length > 0 && (
            <Group label={locale === "fr" ? `Refusé (${declined.length})` : `Declined (${declined.length})`}>
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
          )}

          {filledItems.length > 0 && (
            <Group label={locale === "fr" ? `Pourvu (${filledItems.length})` : `Filled (${filledItems.length})`}>
              {filledItems.map((request) => (
                <FilledCard key={request.id} request={request} locale={locale} />
              ))}
            </Group>
          )}
        </>
      )}

      {confirmingRequest && (
        <ConfirmModal
          request={confirmingRequest}
          busy={busy === confirmingRequest.id}
          locale={locale}
          onCancel={() => setConfirmingRequest(null)}
          onConfirm={() => respond(confirmingRequest.id, "accept")}
        />
      )}
      {decliningRequest && (
        <DeclineModal
          request={decliningRequest}
          reason={declineReason}
          busy={busy === decliningRequest.id}
          locale={locale}
          onReasonChange={setDeclineReason}
          onCancel={() => { setDecliningRequest(null); setDeclineReason(""); }}
          onConfirm={() => respond(decliningRequest.id, "decline", declineReason || undefined)}
        />
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <Eyebrow style={{ marginBottom: 10 }}>{label}</Eyebrow>
      <div style={{ display: "grid", gap: 10 }}>{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: "18px 16px",
      borderRadius: 14,
      background: "#fff",
      border: "0.5px dashed var(--line)",
      color: "var(--ink-3)",
      textAlign: "center",
      fontSize: 14,
    }}>
      {children}
    </div>
  );
}

function RequestCard({
  request, myResponse, eligibility, myUserId, locale, busy, onAccept, onDecline,
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
  const urgent = request.urgency_level >= 3;
  return (
    <article style={{
      background: "#fff",
      borderRadius: 18,
      padding: "14px 16px",
      border: `0.5px solid ${urgent ? "#F2C5B0" : "var(--line)"}`,
      boxShadow: urgent ? "0 8px 24px -16px rgba(220,90,42,.18)" : "none",
      position: "relative",
      overflow: "hidden",
    }}>
      {urgent && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "var(--terra)" }} />}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {urgent && <Chip variant="urgent" dot>{locale === "fr" ? "Urgent" : "Urgent"}</Chip>}
          {request.coverage_type && (
            <Chip variant="default">{coverageLabel(request.coverage_type, locale)}</Chip>
          )}
        </div>
        {request.language_requirement && (
          <Mono style={{ fontSize: 10, color: "var(--ink-3)" }}>{request.language_requirement.toUpperCase()}</Mono>
        )}
      </div>

      <div style={{ fontFamily: "var(--serif)", fontSize: 22, lineHeight: 1.15, marginBottom: 2 }}>
        {request.title}
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: 10 }}>
        {request.location_name ? `${request.location_name} · ` : ""}{request.city}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
        <Meta icon={<Calendar size={13} />} label={request.work_date} sub={`${request.start_time.slice(0,5)} → ${request.end_time.slice(0,5)}`} />
        <Meta icon={<MapPin size={13} />} label={request.city} />
      </div>

      {eligibility && <EligibilityList eligibility={eligibility} />}

      {myResponse?.status === "accepted" && (
        <div style={{ padding: "10px 0", fontSize: 13, color: "var(--moss)", fontWeight: 500 }}>
          {request.status === "responses_received"
            ? (locale === "fr" ? "Réponse reçue · En attente de confirmation." : "Response received · Awaiting confirmation.")
            : (locale === "fr" ? "Réponse envoyée · En attente du coordonnateur." : "Response sent · Awaiting coordinator.")}
        </div>
      )}

      {myResponse?.status === "declined" && myResponse.decline_reason && (
        <div style={{ padding: "8px 0", fontSize: 12, color: "var(--ink-3)" }}>
          {locale === "fr" ? "Raison : " : "Reason: "}{myResponse.decline_reason}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        {onAccept && (
          <button onClick={onAccept} disabled={busy} style={ctaStyle("primary", busy)}>
            {locale === "fr" ? "Je peux le prendre" : "I can take it"}
          </button>
        )}
        {onDecline && (
          <button onClick={onDecline} disabled={busy} style={ctaStyle("ghost", busy)}>
            {locale === "fr" ? "Refuser" : "Decline"}
          </button>
        )}
      </div>
    </article>
  );
}

function EligibilityList({ eligibility }: { eligibility: EligibilityResult }) {
  return (
    <div style={{ background: "var(--paper)", borderRadius: 12, padding: "4px 10px", marginBottom: 10 }}>
      {eligibility.reasons.map((reason, i) => (
        <div key={`${reason.type}-${i}`} style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 0",
          borderBottom: i < eligibility.reasons.length - 1 ? "0.5px solid var(--line-soft)" : "none",
        }}>
          <div style={{
            width: 20, height: 20, borderRadius: 99, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
            background: reason.status === "matched" ? "var(--moss-soft)" : "var(--rose-soft)",
            color: reason.status === "matched" ? "var(--moss)" : "var(--rose)",
          }}>
            {reason.status === "matched" ? <Check size={11} strokeWidth={2.5} /> : <X size={11} strokeWidth={2.5} />}
          </div>
          <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{reason.label}</span>
        </div>
      ))}
    </div>
  );
}

function FilledCard({ request, locale }: { request: StaffingRequest; locale: "en" | "fr" }) {
  return (
    <article style={{
      background: "var(--paper-2)",
      borderRadius: 18,
      padding: "14px 16px",
      border: "0.5px solid var(--line)",
      opacity: 0.8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ fontFamily: "var(--serif)", fontSize: 18, color: "var(--ink-3)" }}>{request.title}</div>
        <Chip variant="default" style={{ color: "var(--ink-3)" }}>{locale === "fr" ? "Pourvu" : "Filled"}</Chip>
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{request.city} · {request.work_date}</div>
      <div style={{ marginTop: 8, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", lineHeight: 1.5 }}>
        {locale === "fr"
          ? "Ce remplacement a été pourvu par un·e autre remplaçant·e."
          : "This request has been filled by another substitute."}
      </div>
    </article>
  );
}

function ConfirmModal({ request, busy, locale, onCancel, onConfirm }: {
  request: StaffingRequest; busy: boolean; locale: "en" | "fr"; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div role="dialog" aria-modal="true" style={overlayStyle}>
      <section style={sheetStyle}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 26, margin: "0 0 6px" }}>
          {locale === "fr" ? <>Confirmer la <em style={{ fontStyle: "italic" }}>disponibilité</em></> : <>Confirm <em style={{ fontStyle: "italic" }}>availability</em></>}
        </h2>
        <p style={{ margin: "0 0 18px", color: "var(--ink-2)", fontSize: 14, lineHeight: 1.5 }}>
          {locale === "fr"
            ? "Votre réponse sera envoyée au coordonnateur pour confirmation finale."
            : "Your response will be sent to the coordinator for final confirmation."}
        </p>
        <div style={{ background: "var(--paper)", borderRadius: 14, padding: "14px 16px", marginBottom: 18 }}>
          <div style={{ fontFamily: "var(--serif)", fontSize: 18, marginBottom: 4 }}>{request.title}</div>
          <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{request.city} · {request.work_date}</div>
          <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{request.start_time.slice(0,5)} – {request.end_time.slice(0,5)}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button onClick={onCancel} disabled={busy} style={ctaStyle("ghost", busy)}>{locale === "fr" ? "Retour" : "Go back"}</button>
          <button onClick={onConfirm} disabled={busy} style={ctaStyle("terra", busy)}>{locale === "fr" ? "Confirmer" : "Confirm"}</button>
        </div>
      </section>
    </div>
  );
}

const DECLINE_REASONS_EN = ["Not available", "Too far", "Not interested", "Conflict with another assignment", "Other"];
const DECLINE_REASONS_FR = ["Non disponible", "Trop loin", "Pas intéressé·e", "Conflit avec une autre affectation", "Autre"];

function DeclineModal({ request, reason, busy, locale, onReasonChange, onCancel, onConfirm }: {
  request: StaffingRequest; reason: string; busy: boolean; locale: "en" | "fr";
  onReasonChange: (r: string) => void; onCancel: () => void; onConfirm: () => void;
}) {
  const reasons = locale === "fr" ? DECLINE_REASONS_FR : DECLINE_REASONS_EN;
  return (
    <div role="dialog" aria-modal="true" style={overlayStyle}>
      <section style={sheetStyle}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 26, margin: "0 0 4px" }}>
          {locale === "fr" ? <>Refuser la <em style={{ fontStyle: "italic" }}>demande</em></> : <>Decline <em style={{ fontStyle: "italic" }}>request</em></>}
        </h2>
        <p style={{ margin: "0 0 18px", color: "var(--ink-2)", fontSize: 14 }}>
          {request.title} · {request.city} · {request.work_date}
        </p>
        <label style={{ display: "grid", gap: 6, marginBottom: 18 }}>
          <Eyebrow>{locale === "fr" ? "Raison (optionnel)" : "Reason (optional)"}</Eyebrow>
          <select value={reason} onChange={(e) => onReasonChange(e.target.value)} style={inputStyle}>
            <option value="">{locale === "fr" ? "Aucune raison" : "No reason provided"}</option>
            {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button onClick={onCancel} disabled={busy} style={ctaStyle("ghost", busy)}>{locale === "fr" ? "Retour" : "Go back"}</button>
          <button onClick={onConfirm} disabled={busy} style={ctaStyle("danger", busy)}>{locale === "fr" ? "Refuser" : "Decline"}</button>
        </div>
      </section>
    </div>
  );
}

function coverageLabel(type: string, locale: "en" | "fr"): string {
  const map: Record<string, { en: string; fr: string }> = {
    same_day_urgent: { en: "Same-day urgent", fr: "Urgent même jour" },
    planned_absence: { en: "Planned absence",  fr: "Absence planifiée" },
    recurring:       { en: "Recurring",        fr: "Récurrent" },
    emergency:       { en: "Emergency",        fr: "Urgence" },
  };
  return map[type]?.[locale] ?? type;
}

const inputStyle: CSSProperties = {
  border: "0.5px solid var(--line)",
  borderRadius: 10,
  background: "#fff",
  color: "var(--ink)",
  fontSize: 14,
  minHeight: 44,
  padding: "0 12px",
  fontFamily: "var(--ui)",
  width: "100%",
};

function ctaStyle(variant: "primary" | "ghost" | "terra" | "danger", disabled: boolean): CSSProperties {
  const base: CSSProperties = {
    border: "none",
    borderRadius: 12,
    padding: "12px 16px",
    fontSize: 14,
    fontWeight: 500,
    cursor: disabled ? "wait" : "pointer",
    opacity: disabled ? 0.6 : 1,
    fontFamily: "var(--ui)",
    flex: 1,
  };
  if (variant === "primary") return { ...base, background: "var(--ink)", color: "var(--paper)" };
  if (variant === "terra")   return { ...base, background: "var(--terra)", color: "#fff" };
  if (variant === "danger")  return { ...base, background: "transparent", color: "var(--rose)", border: "0.5px solid var(--rose-soft)" };
  return { ...base, background: "transparent", color: "var(--ink)", border: "0.5px solid var(--line)" };
}

const overlayStyle: CSSProperties = {
  position: "fixed", inset: 0,
  background: "rgba(21,20,15,.4)",
  display: "flex", alignItems: "flex-end", justifyContent: "center",
  padding: 16, zIndex: 30,
};

const sheetStyle: CSSProperties = {
  width: "min(100%, 480px)",
  background: "#fff",
  borderRadius: 20,
  padding: 22,
  boxShadow: "0 18px 42px rgba(21,20,15,.2)",
};

function matchesTab(r: StaffingRequest, tab: CoverageTab): boolean {
  if (tab === "urgent") return r.urgency_level >= 3;
  if (tab === "today")  return r.work_date === todayStr();
  if (tab === "week")   return inThisWeek(r.work_date);
  return true;
}
function matchesCity(r: StaffingRequest, city: string) { return !city || r.city === city; }
function matchesDate(r: StaffingRequest, date: string) { return !date || r.work_date === date; }
function isUrgent(r: StaffingRequest) { return r.urgency_level >= 3; }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function inThisWeek(dateValue: string): boolean {
  const [y,m,d] = dateValue.split("-").map(Number);
  const target = new Date(y, m-1, d).getTime();
  const today = new Date(); today.setHours(0,0,0,0);
  const end = new Date(today); end.setDate(today.getDate() + 6);
  return target >= today.getTime() && target <= end.getTime();
}
