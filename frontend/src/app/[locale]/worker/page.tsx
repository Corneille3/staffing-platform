"use client";

import { useEffect, useState } from "react";
import { Calendar, ChevronDown, ChevronRight, MapPin, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "../../../i18n/navigation";
import {
  fetchAssignments,
  fetchRequests,
  fetchWorkerResponses,
  updateWorkerPreferences,
} from "../../../lib/browser-api";
import {
  distanceFromWorker,
  formatDistance,
  formatWorkDate,
  locationLabel,
  orgRoleSubtitle,
} from "../../../lib/format";
import { avatarTone } from "../../../lib/avatar-tone";
import { completedCount, nextShift, weekHours } from "../../../lib/inbox-stats";
import { modifiedSinceReview } from "../../../lib/request-modified";
import { Assignment, RequestResponse, StaffingRequest, Worker } from "../../../lib/types";
import { useWorkerSession } from "../../../lib/worker-session";
import { TIMED_OUT, withTimeout } from "../../../lib/with-timeout";
import { Avatar, Chip, Meta, SectionLine } from "../../../components/ui";

// "filled" used to cover five unrelated outcomes at once — you won it, someone
// else won it, it was cancelled, it expired unfilled, it ran to completion —
// all wearing the same "Pourvu" chip, which was simply false for the cancelled
// and expired cases. Each outcome now names itself.
//
// A shift the worker *won* is deliberately absent from this union: it leaves
// the inbox entirely and lives on the Schedule tab, the one place that answers
// "what am I working?". The inbox answers "what did I reply to?".
type CardStatus = "new" | "sent" | "lost" | "cancelled" | "expired" | "declined" | "released";

interface InboxItem {
  request: StaffingRequest;
  status: CardStatus;
  modified: boolean;
}

export default function WorkerHome() {
  const { worker, refresh } = useWorkerSession();
  const locale = useLocale() as "fr" | "en";
  const t = useTranslations("worker.home");
  const tCommon = useTranslations("common");
  const tTime = useTranslations("time");
  const [requests, setRequests] = useState<StaffingRequest[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [responses, setResponses] = useState<RequestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [preferenceBusy, setPreferenceBusy] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);

  useEffect(() => {
    if (!worker) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setLoadError(false);
      // Three fixed round-trips. The worker's request list is already "the
      // requests I was notified for", and the responses endpoint returns every
      // row of theirs at once — the old per-request responses fetch made the
      // page crawl as the network's request count grew.
      // A failed or stalled call used to leave « Chargement… » up forever
      // (PR #104 deploy-order slip): it now ends on an error card with a retry.
      try {
        const loaded = await withTimeout(
          Promise.all([
            fetchRequests(),
            fetchAssignments(),
            fetchWorkerResponses(worker.id),
          ]),
          LOAD_TIMEOUT_MS,
        );
        if (!alive) return;
        if (loaded === TIMED_OUT) {
          setLoadError(true);
        } else {
          const [allRequests, allAssignments, myResponses] = loaded;
          setRequests(allRequests);
          setAssignments(allAssignments.filter((a) => a.worker_user_id === worker.id));
          setResponses(myResponses);
        }
      } catch {
        if (alive) setLoadError(true);
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [worker, reloadKey]);

  if (!worker) return null;

  const availabilityStatus = worker.profile?.availability_status || "unavailable";
  const available = availabilityStatus === "available";

  // work_date is an ISO "YYYY-MM-DD" string, so string compare is date compare.
  const now = new Date();
  const todayIso = isoDate(now);
  // History keeps the last 30 days only — older outcomes stop mattering to
  // the worker (Claude Design, étape 1).
  const historyCutoffIso = isoDate(new Date(now.getTime() - HISTORY_WINDOW_DAYS * 86_400_000));

  // Returns null for a shift this worker WON: it belongs to the Schedule tab,
  // which owns "what am I working?". Keeping it here too is what buried a
  // held, upcoming shift under "History" wearing a "Pourvu" chip.
  const classify = (req: StaffingRequest, myResponse?: RequestResponse): CardStatus | null => {
    // The giver released this shift (or withdrew) — check before req.status,
    // whose "assigned" would otherwise read as if this worker got it
    // (Finding #1).
    if (myResponse?.status === "withdrawn") return "released";
    // My own reply outranks the outcome: once I've declined, what happened to
    // the shift afterwards isn't my business, and "I said no" is the useful
    // memory. (Previously req.status won, so a declined shift that later got
    // filled read "Pourvu" and lost the fact that I turned it down.)
    if (myResponse?.status === "declined") return "declined";
    if (req.status === "cancelled") return "cancelled";
    if (req.status === "expired") return "expired";
    if (req.status === "assigned" || req.status === "completed") {
      return req.assigned_worker_user_id === worker.id ? null : "lost";
    }
    if (myResponse?.status === "accepted") return "sent";
    // "viewed" means opened but not yet replied — falls through to "new" so it
    // stays in the action bucket ("Awaiting your reply"), never the "Reply
    // sent" chip which is reserved for an actual accept.
    return "new";
  };

  const inboxItems: InboxItem[] = requests
    .filter((req) => responses.some((r) => r.staffing_request_id === req.id))
    .map((req) => {
      const myResponse = responses.find((r) => r.staffing_request_id === req.id);
      const status = classify(req, myResponse);
      if (status === null) return null;
      const modified =
        (status === "new" || status === "sent") && modifiedSinceReview(req, myResponse);
      return { request: req, status, modified };
    })
    .filter((i): i is InboxItem => i !== null);

  // Soonest shift first (act on the nearest). Without this the inbox rendered
  // in raw API order — "no order".
  const byWorkDate = (dir: 1 | -1) => (a: InboxItem, b: InboxItem) =>
    dir * (a.request.work_date || "").localeCompare(b.request.work_date || "");

  // "À décider": the only thing the inbox is for — requests waiting on me.
  const toDecide = inboxItems.filter((i) => i.status === "new").sort(byWorkDate(1));

  // "En attente": I said yes, the coordinator hasn't settled it. Not mine to
  // act on, but nowhere else shows it (Schedule only lists shifts I hold), so
  // it keeps a section of its own below the decisions instead of vanishing.
  const waiting = inboxItems.filter((i) => i.status === "sent").sort(byWorkDate(1));

  // History opens on what just happened. Settled shifts still in the future (a
  // shift I declined for next month) are real history for me — they stay, but
  // below the past ones rather than sorting to the very top, which is what a
  // plain work_date-descending sort did.
  const settled = inboxItems.filter(
    (i) => !["new", "sent"].includes(i.status) && (i.request.work_date || "") >= historyCutoffIso,
  );
  const isPast = (i: InboxItem) => (i.request.work_date || "") < todayIso;
  const historyItems = [
    ...settled.filter(isPast).sort(byWorkDate(-1)),
    ...settled.filter((i) => !isPast(i)).sort(byWorkDate(1)),
  ];

  // At-a-glance numbers + next shift, from the assignments already loaded
  // (the Horaire's data) — no endpoint, no extra request (étape 2).
  const scheduleItems = assignments.map((assignment) => ({
    assignment,
    request: requests.find((r) => r.id === assignment.staffing_request_id) ?? null,
  }));
  const hoursThisWeek = weekHours(scheduleItems, todayIso, now.getTime());
  const completedShifts = completedCount(scheduleItems);
  const next = nextShift(scheduleItems, now.getTime());

  const renderCard = ({ request, status, modified }: InboxItem) => (
    <RequestCard
      key={request.id}
      request={request}
      status={status}
      modified={modified}
      worker={worker}
      locale={locale}
      t={t}
      tCommon={tCommon}
      tTime={tTime}
    />
  );

  const firstName = worker.first_name;
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? t("greetingMorning") : hour < 18 ? t("greetingAfternoon") : t("greetingEvening");

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
            {t("headlinePre")} <em style={{ fontStyle: "italic" }}>{t("headlineAccent")}</em>
          </h1>
        </div>
        <Avatar
          initials={`${worker.first_name[0]}${worker.last_name[0]}`}
          tone={avatarTone(`${worker.first_name} ${worker.last_name}`)}
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
          {available ? t("availableToday") : t("unavailable")}
        </div>
        <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{tCommon("edit")}</span>
      </button>

      {preferenceError && (
        <p style={{ margin: "-12px 0 16px", fontSize: 12, color: "var(--rose)" }}>{preferenceError}</p>
      )}

      {/* Stat tiles + next shift — rendered once the data is in, so the
          numbers never flash from 0. Reliability is deliberately absent: it
          exists on the profile but is only recomputed by hand. */}
      {!loading && !loadError && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <StatTile
              value={`${hoursThisWeek.toLocaleString(locale === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 1 })} h`}
              label={t("statHoursWeek")}
              tone={hoursThisWeek > 0 ? "moss" : "ink"}
            />
            <StatTile value={String(completedShifts)} label={t("statCompleted")} tone="ink" />
          </div>
          {next?.request && (
            <NextShiftCard
              request={next.request}
              dateLine={[
                next.request.organization?.name,
                `${formatWorkDate(next.request.work_date, locale)} · ${next.request.start_time.slice(0, 5)} – ${next.request.end_time.slice(0, 5)}`,
                locationLabel(next.request),
              ].filter(Boolean).join(" · ")}
              label={t("nextShift")}
            />
          )}
        </>
      )}

      {/* Permanent staff: report an absence (their schedule lives outside StaffiG,
          so there's no held shift to release — they describe the shift). */}
      {worker.employment_type === "permanent" && (
        <Link
          href="/worker/report-absence"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            background: "var(--card)",
            border: "0.5px solid var(--terra)",
            borderRadius: 14,
            marginBottom: 20,
            textDecoration: "none",
            color: "var(--terra)",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          <Calendar size={16} />
          {t("reportAbsence")}
        </Link>
      )}

      {/* À décider — the inbox proper */}
      <SectionLine label={t("sectionToDecide")} count={t("requestCount", { n: toDecide.length })} />
      {loading ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>
          {tCommon("loading")}
        </div>
      ) : loadError ? (
        <LoadErrorCard t={t} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : toDecide.length === 0 ? (
        <EmptyInbox t={t} />
      ) : (
        toDecide.map((item) => renderCard(item))
      )}

      {/* En attente — accepted, coordinator hasn't settled it */}
      {!loading && waiting.length > 0 && (
        <>
          <SectionLine
            label={t("sectionWaiting")}
            count={t("requestCount", { n: waiting.length })}
            style={{ marginTop: 28 }}
          />
          {waiting.map((item) => renderCard(item))}
        </>
      )}

      {/* Historique — collapsed by default, last 30 days. The only place a
          declined / lost / cancelled / expired / released request stays
          visible (the Alerts feed covers just a subset), so the trace stays
          one tap away rather than getting its own tab. */}
      {!loading && historyItems.length > 0 ? (
        <div style={{ marginTop: 20 }}>
          <button
            onClick={() => setHistoryOpen((open) => !open)}
            aria-expanded={historyOpen}
            style={{
              width: "100%",
              minHeight: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              background: "transparent",
              border: "none",
              color: "var(--ink-3)",
              fontFamily: "var(--ui)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {t("history")} · {historyItems.length}
            <ChevronDown
              size={14}
              style={{ transform: historyOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }}
            />
          </button>
          {historyOpen && (
            <>
              <div style={{ textAlign: "center", fontSize: 11, color: "var(--ink-4)", marginBottom: 10 }}>
                {t("historyWindow")}
              </div>
              {historyItems.map((item) => renderCard(item))}
            </>
          )}
        </div>
      ) : (
        !loading && !loadError && (
          <div style={{ textAlign: "center", padding: "20px 0 8px", color: "var(--ink-4)", fontSize: 12 }}>
            {t("thatsAll")}
          </div>
        )
      )}
    </div>
  );
}

const HISTORY_WINDOW_DAYS = 30;
// The three Boîte calls normally answer in well under a second; past this the
// page stops waiting and offers a retry instead of « Chargement… » forever.
const LOAD_TIMEOUT_MS = 20_000;

function StatTile({ value, label, tone }: { value: string; label: string; tone: "moss" | "ink" }) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "0.5px solid var(--line)",
        borderRadius: "var(--r-md, 14px)",
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--serif)",
          fontSize: 26,
          lineHeight: 1.1,
          color: tone === "moss" ? "var(--moss)" : "var(--ink)",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3, letterSpacing: ".02em" }}>{label}</div>
    </div>
  );
}

// First confirmed shift still to come — one tap to the Horaire. Hidden when
// there is none (the page checks before rendering).
function NextShiftCard({
  request,
  dateLine,
  label,
}: {
  request: StaffingRequest;
  dateLine: string;
  label: string;
}) {
  return (
    <Link
      href="/worker/schedule"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        minHeight: 44,
        padding: "12px 14px",
        marginBottom: 20,
        background: "var(--card)",
        border: "0.5px solid var(--line)",
        borderRadius: 18,
        textDecoration: "none",
        color: "var(--ink)",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: "var(--sand-soft)",
          color: "#7C5C12",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Calendar size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 500 }}>
          {label}
        </div>
        <div style={{ fontSize: 15, fontWeight: 500, marginTop: 2 }}>
          {request.title || request.organization?.name}
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 2 }}>{dateLine}</div>
      </div>
      <ChevronRight size={16} style={{ color: "var(--ink-3)", flexShrink: 0 }} />
    </Link>
  );
}

// Local calendar date as "YYYY-MM-DD" (same shape as the API's work_date).
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function LoadErrorCard({ t, onRetry }: { t: ReturnType<typeof useTranslations>; onRetry: () => void }) {
  return (
    <div
      role="alert"
      style={{
        padding: "22px 18px",
        textAlign: "center",
        background: "var(--card)",
        border: "0.5px solid var(--terra)",
        borderRadius: 16,
      }}
    >
      <h2
        style={{
          fontFamily: "var(--serif)",
          fontSize: 22,
          lineHeight: 1.15,
          fontWeight: 400,
          margin: "0 0 8px",
        }}
      >
        {t.rich("loadErrorTitle", {
          em: (chunks) => <em style={{ fontStyle: "italic" }}>{chunks}</em>,
        })}
      </h2>
      <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.45, margin: "0 0 18px" }}>
        {t("loadErrorBody")}
      </p>
      <button
        type="button"
        onClick={onRetry}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          minHeight: 44,
          padding: "0 22px",
          borderRadius: 12,
          border: "none",
          background: "var(--terra)",
          color: "#fff",
          fontSize: 14,
          fontWeight: 500,
          fontFamily: "var(--ui)",
          cursor: "pointer",
        }}
      >
        <RefreshCw size={15} strokeWidth={1.8} />
        {t("loadErrorRetry")}
      </button>
    </div>
  );
}

function EmptyInbox({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div style={{ padding: "28px 8px 8px", textAlign: "center" }}>
      <EmptyInboxIllustration />
      <h2
        style={{
          fontFamily: "var(--serif)",
          fontSize: 22,
          lineHeight: 1.15,
          fontWeight: 400,
          margin: "16px 0 8px",
        }}
      >
        {t.rich("emptyTitle", {
          em: (chunks) => <em style={{ fontStyle: "italic" }}>{chunks}</em>,
        })}
      </h2>
      <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.45, margin: "0 0 20px" }}>
        {t("emptyBody")}
      </p>
      <Link
        href="/worker/availability"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 44,
          padding: "0 18px",
          borderRadius: 12,
          background: "var(--moss)",
          color: "#fff",
          fontSize: 14,
          fontWeight: 500,
          fontFamily: "var(--ui)",
          textDecoration: "none",
        }}
      >
        {t("emptyCta")}
      </Link>
    </div>
  );
}

// Envelope with a moss check badge — inline SVG, stroke on the 24 px grid
// convention (no emoji, no image asset).
function EmptyInboxIllustration() {
  return (
    <svg width="88" height="72" viewBox="0 0 88 72" fill="none" aria-hidden="true" style={{ display: "block", margin: "0 auto" }}>
      <rect x="6" y="14" width="62" height="44" rx="7" fill="#fff" stroke="var(--ink-3)" strokeWidth="1.5" />
      <path d="M9 20 L37 40 L65 20" stroke="var(--ink-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="67" cy="52" r="15" fill="var(--moss)" stroke="var(--paper)" strokeWidth="3" />
      <path d="M60 52 L65 57 L74 47" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RequestCard({
  request,
  status,
  modified,
  worker,
  locale,
  t,
  tCommon,
  tTime,
}: {
  request: StaffingRequest;
  status: CardStatus;
  modified: boolean;
  worker: Worker;
  locale: "fr" | "en";
  t: ReturnType<typeof useTranslations>;
  tCommon: ReturnType<typeof useTranslations>;
  tTime: ReturnType<typeof useTranslations>;
}) {
  const router = useRouter();
  const urgent = request.urgency_level >= 3;
  const timeAgo = formatTimeAgo(request.created_at, tTime);
  const subtitle = orgRoleSubtitle(request, locale);
  const distanceKm = distanceFromWorker(request, worker.profile);
  const distanceLabel = formatDistance(distanceKm);
  const dateLabel = formatWorkDate(request.work_date, locale);
  const cityLabel = locationLabel(request);
  // A shift this worker holds no longer reaches the inbox at all (classify
  // returns null for it), so there's no assigned-to-me case to route here any
  // more — the Schedule tab owns it. What's left needing the tracking page is
  // a pending reply and a shift they released.
  const detailHref =
    status === "sent" || status === "released"
      ? `/worker/requests/${request.id}/accepted`
      : `/worker/requests/${request.id}`;
  const openDetail = () => router.push(detailHref);

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={openDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDetail();
        }
      }}
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
        cursor: "pointer",
      }}
    >
      {urgent && (
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "var(--terra)" }} />
      )}

      {modified && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 10,
            padding: "7px 10px",
            borderRadius: 10,
            background: "var(--sand-soft)",
            border: "0.5px solid var(--sand)",
            color: "#7C5C12",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <RefreshCw size={13} strokeWidth={2} />
          {t("modifiedBanner")}
        </div>
      )}

      {/* Top row: chips + time */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {urgent && <Chip variant="urgent" dot>{tCommon("urgent")}</Chip>}
          {status === "new"      && <Chip variant="terra" dot>{t("chipNew")}</Chip>}
          {status === "sent"     && <Chip variant="sand"  dot>{t("chipSent")}</Chip>}
          {status === "declined"  && <Chip variant="default" style={{ color: "var(--ink-3)" }}>{t("chipDeclined")}</Chip>}
          {status === "lost"      && <Chip variant="default" style={{ color: "var(--ink-3)" }}>{t("chipLost")}</Chip>}
          {status === "cancelled" && <Chip variant="default" style={{ color: "var(--ink-3)" }}>{t("chipCancelled")}</Chip>}
          {status === "expired"   && <Chip variant="default" style={{ color: "var(--ink-3)" }}>{t("chipExpired")}</Chip>}
          {status === "released"  && <Chip variant="default" style={{ color: "var(--ink-3)" }}>{t("chipReleased")}</Chip>}
        </div>
        <span style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap" }}>{timeAgo}</span>
      </div>

      {/* Request title — the coordinator's words; org · role · sector under it */}
      <div style={{ fontFamily: "var(--serif)", fontSize: 22, lineHeight: 1.15, marginBottom: 2 }}>
        {request.title || request.organization?.name}
      </div>
      {subtitle && (
        <div style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: 10 }}>{subtitle}</div>
      )}

      {/* Meta grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
        <Meta
          icon={<Calendar size={13} />}
          label={dateLabel}
          sub={`${request.start_time.slice(0, 5)} → ${request.end_time.slice(0, 5)}`}
        />
        <Meta
          icon={<MapPin size={13} />}
          label={cityLabel}
          sub={distanceLabel ?? undefined}
        />
      </div>

      {/* CTAs */}
      {status === "new" && (
        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href={detailHref}
            onClick={(e) => e.stopPropagation()}
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
            {t("iCanTakeIt")}
          </Link>
          <Link
            href={detailHref}
            onClick={(e) => e.stopPropagation()}
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
            {tCommon("decline")}
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
          {t("waitingForConfirmation")}
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(createdAt: string | undefined, tTime: ReturnType<typeof useTranslations>): string {
  if (!createdAt) return "";
  const diff = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return tTime("justNow");
  if (mins < 60) return tTime("minutesAgo", { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return tTime("hoursAgo", { n: hours });
  const days = Math.floor(hours / 24);
  return tTime("daysAgo", { n: days });
}
