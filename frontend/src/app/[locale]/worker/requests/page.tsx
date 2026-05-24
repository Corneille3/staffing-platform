"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { Calendar, MapPin, Check, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  acceptRequest,
  declineRequest,
  fetchRequestEligibility,
  fetchRequestResponses,
  fetchRequests,
  markRequestViewed,
} from "../../../../lib/browser-api";
import {
  distanceFromWorker,
  formatDistance,
  formatWorkDate,
  locationLabel,
  roleSectorSubtitle,
} from "../../../../lib/format";
import { EligibilityResult, RequestResponse, StaffingRequest, Worker } from "../../../../lib/types";
import { useWorkerSession } from "../../../../lib/worker-session";
import { Chip, Eyebrow, Meta, Mono } from "../../../../components/ui";

type RequestWithMyResponse = {
  request: StaffingRequest;
  myResponse: RequestResponse | null;
  eligibility: EligibilityResult | null;
};

type CoverageTab = "all" | "urgent" | "today" | "week";

const DECLINE_REASON_KEYS = ["notAvailable", "tooFar", "notInterested", "conflict", "other"] as const;

export default function WorkerRequestsPage() {
  const { worker } = useWorkerSession();
  const locale = useLocale() as "fr" | "en";
  const t = useTranslations("worker.requests");
  const tCommon = useTranslations("common");
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

  const tabLabels: Record<CoverageTab, string> = {
    all:    t("tabAll"),
    urgent: t("tabUrgent"),
    today:  t("tabToday"),
    week:   t("tabWeek"),
  };

  return (
    <div style={{ paddingTop: 24 }}>
      {/* Heading */}
      <div style={{ marginBottom: 20 }}>
        <Eyebrow style={{ marginBottom: 4 }}>{t("eyebrow")}</Eyebrow>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 30, lineHeight: 1.05, margin: 0 }}>
          {t("headlinePre")} <em style={{ fontStyle: "italic" }}>{t("headlineAccent")}</em>
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
            {t("unavailableNotice")}
          </div>
        </div>
      ) : loading ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>
          {tCommon("loading")}
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", paddingBottom: 2 }}>
            {(["all", "urgent", "today", "week"] as CoverageTab[]).map((tab) => (
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
                {tabLabels[tab]}
              </button>
            ))}
          </div>

          {/* Filters row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              style={inputStyle}
            >
              <option value="">{t("filterCity")}</option>
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
              {t("filterUrgent")}
            </label>
            {hasFilters && (
              <button
                onClick={() => { setActiveTab("all"); setCityFilter(""); setDateFilter(""); setUrgentOnly(false); }}
                style={{ border: "none", background: "transparent", color: "var(--ink-3)", fontSize: 13, cursor: "pointer", fontFamily: "var(--ui)" }}
              >
                {t("clearFilters")}
              </button>
            )}
          </div>

          {/* Pending group */}
          <Group label={t("pendingCount", { n: undecided.length })}>
            {undecided.length === 0 ? (
              <Empty>{t("noPending")}</Empty>
            ) : (
              undecided.map(({ request, myResponse, eligibility }) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  myResponse={myResponse}
                  eligibility={eligibility}
                  worker={worker}
                  locale={locale}
                  busy={busy === request.id}
                  t={t}
                  tCommon={tCommon}
                  onAccept={() => setConfirmingRequest(request)}
                  onDecline={() => setDecliningRequest(request)}
                />
              ))
            )}
          </Group>

          {accepted.length > 0 && (
            <Group label={t("acceptedCount", { n: accepted.length })}>
              {accepted.map(({ request, myResponse, eligibility }) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  myResponse={myResponse}
                  eligibility={eligibility}
                  worker={worker}
                  locale={locale}
                  busy={busy === request.id}
                  t={t}
                  tCommon={tCommon}
                  onDecline={() => setDecliningRequest(request)}
                />
              ))}
            </Group>
          )}

          {declined.length > 0 && (
            <Group label={t("declinedCount", { n: declined.length })}>
              {declined.map(({ request, myResponse, eligibility }) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  myResponse={myResponse}
                  eligibility={eligibility}
                  worker={worker}
                  locale={locale}
                  busy={busy === request.id}
                  t={t}
                  tCommon={tCommon}
                  onAccept={() => setConfirmingRequest(request)}
                />
              ))}
            </Group>
          )}

          {filledItems.length > 0 && (
            <Group label={t("filledCount", { n: filledItems.length })}>
              {filledItems.map((request) => (
                <FilledCard key={request.id} request={request} locale={locale} t={t} tCommon={tCommon} />
              ))}
            </Group>
          )}
        </>
      )}

      {confirmingRequest && (
        <ConfirmModal
          request={confirmingRequest}
          locale={locale}
          busy={busy === confirmingRequest.id}
          t={t}
          onCancel={() => setConfirmingRequest(null)}
          onConfirm={() => respond(confirmingRequest.id, "accept")}
        />
      )}
      {decliningRequest && (
        <DeclineModal
          request={decliningRequest}
          locale={locale}
          reason={declineReason}
          busy={busy === decliningRequest.id}
          t={t}
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
  request, myResponse, eligibility, worker, locale, busy, t, tCommon, onAccept, onDecline,
}: {
  request: StaffingRequest;
  myResponse: RequestResponse | null;
  eligibility: EligibilityResult | null;
  worker: Worker;
  locale: "fr" | "en";
  busy: boolean;
  t: ReturnType<typeof useTranslations>;
  tCommon: ReturnType<typeof useTranslations>;
  onAccept?: () => void;
  onDecline?: () => void;
}) {
  const urgent = request.urgency_level >= 3;
  const subtitle = roleSectorSubtitle(request, locale);
  const distanceKm = distanceFromWorker(request, worker.profile);
  const distanceLabel = formatDistance(distanceKm);
  const dateLabel = formatWorkDate(request.work_date, locale);
  const cityLabel = locationLabel(request);
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
          {urgent && <Chip variant="urgent" dot>{tCommon("urgent")}</Chip>}
          {request.coverage_type && (
            <Chip variant="default">{t(`coverage.${request.coverage_type}` as never)}</Chip>
          )}
        </div>
        {request.language_requirement && (
          <Mono style={{ fontSize: 10, color: "var(--ink-3)" }}>{request.language_requirement.toUpperCase()}</Mono>
        )}
      </div>

      <div style={{ fontFamily: "var(--serif)", fontSize: 22, lineHeight: 1.15, marginBottom: 2 }}>
        {request.organization?.name ?? request.title}
      </div>
      {subtitle && (
        <div style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: 10 }}>{subtitle}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
        <Meta icon={<Calendar size={13} />} label={dateLabel} sub={`${request.start_time.slice(0,5)} → ${request.end_time.slice(0,5)}`} />
        <Meta icon={<MapPin size={13} />} label={cityLabel} sub={distanceLabel ?? undefined} />
      </div>

      {eligibility && <EligibilityList eligibility={eligibility} />}

      {myResponse?.status === "accepted" && (
        <div style={{ padding: "10px 0", fontSize: 13, color: "var(--moss)", fontWeight: 500 }}>
          {request.status === "responses_received" ? t("responseReceived") : t("responseSent")}
        </div>
      )}

      {myResponse?.status === "declined" && myResponse.decline_reason && (
        <div style={{ padding: "8px 0", fontSize: 12, color: "var(--ink-3)" }}>
          {t("reasonPrefix")}{myResponse.decline_reason}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        {onAccept && (
          <button onClick={onAccept} disabled={busy} style={ctaStyle("primary", busy)}>
            {t("iCanTakeIt")}
          </button>
        )}
        {onDecline && (
          <button onClick={onDecline} disabled={busy} style={ctaStyle("ghost", busy)}>
            {t("decline")}
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

function FilledCard({
  request,
  locale,
  t,
  tCommon,
}: {
  request: StaffingRequest;
  locale: "fr" | "en";
  t: ReturnType<typeof useTranslations>;
  tCommon: ReturnType<typeof useTranslations>;
}) {
  return (
    <article style={{
      background: "var(--paper-2)",
      borderRadius: 18,
      padding: "14px 16px",
      border: "0.5px solid var(--line)",
      opacity: 0.8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ fontFamily: "var(--serif)", fontSize: 18, color: "var(--ink-3)" }}>{request.organization?.name ?? request.title}</div>
        <Chip variant="default" style={{ color: "var(--ink-3)" }}>{tCommon("filled")}</Chip>
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{locationLabel(request)} · {formatWorkDate(request.work_date, locale)}</div>
      <div style={{ marginTop: 8, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", lineHeight: 1.5 }}>
        {t("filledByOther")}
      </div>
    </article>
  );
}

function ConfirmModal({
  request,
  locale,
  busy,
  t,
  onCancel,
  onConfirm,
}: {
  request: StaffingRequest;
  locale: "fr" | "en";
  busy: boolean;
  t: ReturnType<typeof useTranslations>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div role="dialog" aria-modal="true" style={overlayStyle}>
      <section style={sheetStyle}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 26, margin: "0 0 6px" }}>
          {t("confirmModal.headlinePre")} <em style={{ fontStyle: "italic" }}>{t("confirmModal.headlineAccent")}</em>
        </h2>
        <p style={{ margin: "0 0 18px", color: "var(--ink-2)", fontSize: 14, lineHeight: 1.5 }}>
          {t("confirmModalSub")}
        </p>
        <div style={{ background: "var(--paper)", borderRadius: 14, padding: "14px 16px", marginBottom: 18 }}>
          <div style={{ fontFamily: "var(--serif)", fontSize: 18, marginBottom: 4 }}>{request.organization?.name ?? request.title}</div>
          <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{locationLabel(request)} · {formatWorkDate(request.work_date, locale)}</div>
          <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{request.start_time.slice(0,5)} – {request.end_time.slice(0,5)}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button onClick={onCancel} disabled={busy} style={ctaStyle("ghost", busy)}>{t("confirmModal.back")}</button>
          <button onClick={onConfirm} disabled={busy} style={ctaStyle("terra", busy)}>{t("confirmModal.confirm")}</button>
        </div>
      </section>
    </div>
  );
}

function DeclineModal({
  request,
  locale,
  reason,
  busy,
  t,
  onReasonChange,
  onCancel,
  onConfirm,
}: {
  request: StaffingRequest;
  locale: "fr" | "en";
  reason: string;
  busy: boolean;
  t: ReturnType<typeof useTranslations>;
  onReasonChange: (r: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div role="dialog" aria-modal="true" style={overlayStyle}>
      <section style={sheetStyle}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 26, margin: "0 0 4px" }}>
          {t("declineModal.headlinePre")} <em style={{ fontStyle: "italic" }}>{t("declineModal.headlineAccent")}</em>
        </h2>
        <p style={{ margin: "0 0 18px", color: "var(--ink-2)", fontSize: 14 }}>
          {t("declineModalSub", {
            title: request.organization?.name ?? request.title,
            city: locationLabel(request),
            date: formatWorkDate(request.work_date, locale),
          })}
        </p>
        <label style={{ display: "grid", gap: 6, marginBottom: 18 }}>
          <Eyebrow>{t("declineModal.reasonLabel")}</Eyebrow>
          <select value={reason} onChange={(e) => onReasonChange(e.target.value)} style={inputStyle}>
            <option value="">{t("declineModal.noReason")}</option>
            {DECLINE_REASON_KEYS.map((key) => {
              const label = t(`declineReasons.${key}` as never) as string;
              return <option key={key} value={label}>{label}</option>;
            })}
          </select>
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button onClick={onCancel} disabled={busy} style={ctaStyle("ghost", busy)}>{t("declineModal.back")}</button>
          <button onClick={onConfirm} disabled={busy} style={ctaStyle("danger", busy)}>{t("declineModal.decline")}</button>
        </div>
      </section>
    </div>
  );
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
