"use client";

import { useEffect, useState } from "react";
import { Calendar, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "../../../i18n/navigation";
import {
  fetchAssignments,
  fetchRequestResponses,
  fetchRequests,
  updateWorkerPreferences,
} from "../../../lib/browser-api";
import {
  distanceFromWorker,
  formatDistance,
  formatWorkDate,
  locationLabel,
  roleSectorSubtitle,
} from "../../../lib/format";
import { Assignment, RequestResponse, StaffingRequest, Worker } from "../../../lib/types";
import { useWorkerSession } from "../../../lib/worker-session";
import { Avatar, Chip, Meta, Mono } from "../../../components/ui";

type CardStatus = "new" | "sent" | "filled" | "declined";

interface InboxItem {
  request: StaffingRequest;
  status: CardStatus;
}

export default function WorkerHome() {
  const { worker, refresh } = useWorkerSession();
  const locale = useLocale() as "fr" | "en";
  const t = useTranslations("worker.home");
  const tCommon = useTranslations("common");
  const tTime = useTranslations("time");
  const [requests, setRequests] = useState<StaffingRequest[]>([]);
  const [, setAssignments] = useState<Assignment[]>([]);
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

  const availabilityStatus = worker.profile?.availability_status || "unavailable";
  const available = availabilityStatus === "available";

  const inboxItems: InboxItem[] = requests
    .filter((req) => responses.some((r) => r.staffing_request_id === req.id))
    .map((req) => {
      const myResponse = responses.find((r) => r.staffing_request_id === req.id);
      let status: CardStatus = "new";
      if (["assigned", "completed", "cancelled", "expired"].includes(req.status)) {
        status = "filled";
      } else if (myResponse?.status === "declined") {
        status = "declined";
      } else if (myResponse && ["accepted", "viewed"].includes(myResponse.status)) {
        status = "sent";
      }
      return { request: req, status };
    });

  const activeItems = inboxItems.filter((i) => i.status === "new" || i.status === "sent");
  const historyItems = inboxItems.filter((i) => i.status === "filled" || i.status === "declined");
  const displayed = tab === "active" ? activeItems : historyItems;

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
          {available ? t("availableToday") : t("unavailable")}
        </div>
        <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{tCommon("edit")}</span>
      </button>

      {preferenceError && (
        <p style={{ margin: "-12px 0 16px", fontSize: 12, color: "var(--rose)" }}>{preferenceError}</p>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 12, borderBottom: "0.5px solid var(--line)" }}>
        {(["active", "history"] as const).map((tabKey) => {
          const count = tabKey === "active" ? activeItems.length : historyItems.length;
          return (
            <button
              key={tabKey}
              onClick={() => setTab(tabKey)}
              style={{
                border: "none",
                background: "transparent",
                padding: "8px 0",
                marginRight: 20,
                fontFamily: "var(--ui)",
                fontSize: 14,
                fontWeight: tab === tabKey ? 600 : 400,
                color: tab === tabKey ? "var(--ink)" : "var(--ink-3)",
                borderBottom: tab === tabKey ? "1.5px solid var(--ink)" : "1.5px solid transparent",
                marginBottom: -1,
                cursor: "pointer",
              }}
            >
              {tabKey === "active" ? t("tabActive") : t("tabHistory")}
              {" "}
              <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Request list */}
      {loading ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>
          {tCommon("loading")}
        </div>
      ) : displayed.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>
          {tab === "active" ? t("noActive") : t("noHistory")}
        </div>
      ) : (
        displayed.map(({ request, status }) => (
          <RequestCard
            key={request.id}
            request={request}
            status={status}
            worker={worker}
            locale={locale}
            t={t}
            tCommon={tCommon}
            tTime={tTime}
          />
        ))
      )}

      <div style={{ textAlign: "center", padding: "20px 0 8px", color: "var(--ink-4)", fontSize: 12 }}>
        {t("thatsAll")}
      </div>
    </div>
  );
}

function RequestCard({
  request,
  status,
  worker,
  locale,
  t,
  tCommon,
  tTime,
}: {
  request: StaffingRequest;
  status: CardStatus;
  worker: Worker;
  locale: "fr" | "en";
  t: ReturnType<typeof useTranslations>;
  tCommon: ReturnType<typeof useTranslations>;
  tTime: ReturnType<typeof useTranslations>;
}) {
  const router = useRouter();
  const urgent = request.urgency_level >= 3;
  const timeAgo = formatTimeAgo(request.created_at, tTime);
  const subtitle = roleSectorSubtitle(request, locale);
  const distanceKm = distanceFromWorker(request, worker.profile);
  const distanceLabel = formatDistance(distanceKm);
  const dateLabel = formatWorkDate(request.work_date, locale);
  const cityLabel = locationLabel(request);
  const detailHref =
    status === "sent"
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

      {/* Top row: chips + time */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {urgent && <Chip variant="urgent" dot>{tCommon("urgent")}</Chip>}
          {status === "new"      && <Chip variant="terra" dot>{t("chipNew")}</Chip>}
          {status === "sent"     && <Chip variant="sand"  dot>{t("chipSent")}</Chip>}
          {status === "declined" && <Chip variant="default" style={{ color: "var(--ink-3)" }}>{t("chipDeclined")}</Chip>}
          {status === "filled"   && <Chip variant="default" style={{ color: "var(--ink-3)" }}>{tCommon("filled")}</Chip>}
        </div>
        <Mono style={{ fontSize: 10, color: "var(--ink-3)" }}>{timeAgo}</Mono>
      </div>

      {/* Org name */}
      <div style={{ fontFamily: "var(--serif)", fontSize: 22, lineHeight: 1.15, marginBottom: 2 }}>
        {request.organization?.name ?? request.title}
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
