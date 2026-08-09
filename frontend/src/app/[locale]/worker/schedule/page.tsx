"use client";

import { useEffect, useState } from "react";
import { Calendar, CheckCircle2, ChevronRight, Mail, MapPin, Navigation, Phone, User } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "../../../../i18n/navigation";
import { checkInAssignment, fetchAssignments, fetchRequests } from "../../../../lib/browser-api";
import { formatWorkDate, locationLabel, roleSectorSubtitle } from "../../../../lib/format";
import { assignmentStatusLabel } from "../../../../lib/status-labels";
import { Assignment, StaffingRequest } from "../../../../lib/types";
import { useWorkerSession } from "../../../../lib/worker-session";
import { Chip, Eyebrow, Mono } from "../../../../components/ui";

type EnrichedAssignment = {
  assignment: Assignment;
  request: StaffingRequest | null;
};

export default function WorkerSchedulePage() {
  const { worker } = useWorkerSession();
  const locale = useLocale() as "fr" | "en";
  const t = useTranslations("worker.schedule");
  const tCommon = useTranslations("common");
  const [items, setItems] = useState<EnrichedAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!worker) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const [allAssignments, allRequests] = await Promise.all([
        fetchAssignments(),
        fetchRequests(),
      ]);
      if (!alive) return;
      const mine = allAssignments.filter((a) => a.worker_user_id === worker.id);
      const enriched: EnrichedAssignment[] = mine.map((assignment) => ({
        assignment,
        request: allRequests.find((r) => r.id === assignment.staffing_request_id) || null,
      }));
      enriched.sort((a, b) => {
        const aDate = a.request?.work_date || "";
        const bDate = b.request?.work_date || "";
        return aDate.localeCompare(bDate);
      });
      setItems(enriched);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [worker]);

  if (!worker) return null;

  // Upcoming: soonest shift first (base sort is ascending). Past: most recent
  // first, so the last shift worked is at the top instead of the oldest.
  const upcoming = items.filter(
    (i) => i.assignment.status === "pending_confirmation" || i.assignment.status === "confirmed",
  );
  const past = items
    .filter((i) => i.assignment.status === "completed" || i.assignment.status === "cancelled")
    .sort((a, b) => (b.request?.work_date || "").localeCompare(a.request?.work_date || ""));

  const hero = upcoming[0];
  const rest = upcoming.slice(1);

  return (
    <div style={{ display: "grid", gap: 24, paddingTop: 16 }}>
      <header>
        <Eyebrow style={{ marginBottom: 4 }}>
          {upcoming.length === 0 ? t("noShifts") : t("upcomingCount", { n: upcoming.length })}
        </Eyebrow>
        <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 30, lineHeight: 1.05 }}>
          {t("headlinePre")} <em style={{ fontStyle: "italic" }}>{t("headlineAccent")}</em>
        </h1>
      </header>

      {loading ? (
        <p style={{ color: "var(--ink-3)", fontSize: 14 }}>{tCommon("loading")}</p>
      ) : upcoming.length === 0 ? (
        <div style={{
          padding: 24,
          borderRadius: 18,
          background: "var(--card)",
          border: "0.5px dashed var(--line)",
          color: "var(--ink-3)",
          textAlign: "center",
          fontSize: 14,
          lineHeight: 1.5,
        }}>
          {t("noUpcoming")}
        </div>
      ) : (
        <>
          {hero && hero.request && (
            <HeroCard
              assignment={hero.assignment}
              request={hero.request}
              locale={locale}
              t={t}
              onCheckedIn={(updated) => {
                setItems((prev) =>
                  prev.map((it) => (it.assignment.id === updated.id ? { ...it, assignment: updated } : it)),
                );
              }}
            />
          )}

          {rest.length > 0 && (
            <section>
              <Eyebrow style={{ marginBottom: 10 }}>{t("comingUp")}</Eyebrow>
              <div style={{
                background: "var(--card)",
                border: "0.5px solid var(--line)",
                borderRadius: 18,
                overflow: "hidden",
              }}>
                {rest.map(({ assignment, request }, i) =>
                  request ? (
                    <UpcomingRow
                      key={assignment.id}
                      assignment={assignment}
                      request={request}
                      locale={locale}
                      last={i === rest.length - 1}
                    />
                  ) : null
                )}
              </div>
            </section>
          )}
        </>
      )}

      {past.length > 0 && (
        <section>
          <Eyebrow style={{ marginBottom: 10 }}>{t("history")}</Eyebrow>
          <div style={{ display: "grid", gap: 8 }}>
            {past.map(({ assignment, request }) =>
              request ? (
                <PastCard key={assignment.id} assignment={assignment} request={request} locale={locale} />
              ) : null
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function HeroCard({
  assignment,
  request,
  locale,
  t,
  onCheckedIn,
}: {
  assignment: Assignment;
  request: StaffingRequest;
  locale: "en" | "fr";
  t: ReturnType<typeof useTranslations>;
  onCheckedIn: (updated: Assignment) => void;
}) {
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const showCheckIn = request.work_date === todayIso;
  return (
    <article style={{
      background: "var(--ink)",
      color: "var(--paper)",
      borderRadius: 22,
      padding: 22,
      position: "relative",
      overflow: "hidden",
      display: "grid",
      gap: 16,
    }}>
      <svg
        style={{ position: "absolute", right: -30, top: -30, opacity: 0.1 }}
        width="160"
        height="160"
        viewBox="0 0 200 200"
      >
        <circle cx="100" cy="100" r="80" stroke="#DC5A2A" strokeWidth="1" fill="none" />
        <circle cx="100" cy="100" r="40" stroke="#DC5A2A" strokeWidth="1" fill="none" />
      </svg>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Chip
          variant="moss"
          dot
          style={{ background: "rgba(37,104,74,.3)", color: "#A8D9B8", border: "none" }}
        >
          {assignmentStatusLabel(assignment.status, locale)}
        </Chip>
        <Link
          href={`/worker/requests/${request.id}/accepted`}
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12.5,
            fontWeight: 600,
            color: "rgba(246,244,238,.85)",
            textDecoration: "none",
          }}
        >
          {t("manageShift")}
          <ChevronRight size={14} />
        </Link>
      </div>

      <div>
        <div style={{ fontFamily: "var(--serif)", fontSize: 28, lineHeight: 1.1 }}>
          {request.organization?.name ?? request.title}
        </div>
        {roleSectorSubtitle(request, locale) && (
          <div style={{ fontSize: 13, color: "rgba(246,244,238,.65)", marginTop: 4 }}>
            {roleSectorSubtitle(request, locale)}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
        <Mono style={{ fontSize: 28, fontWeight: 500, color: "var(--paper)" }}>
          {request.start_time.slice(0, 5)}
        </Mono>
        <div style={{ flex: 1, height: 1, background: "rgba(246,244,238,.18)" }} />
        <Mono style={{ fontSize: 28, fontWeight: 500, color: "var(--paper)" }}>
          {request.end_time.slice(0, 5)}
        </Mono>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, color: "rgba(246,244,238,.65)", fontSize: 13 }}>
        <Calendar size={14} />
        <span>{formatWorkDate(request.work_date, locale)}</span>
        <MapPin size={14} style={{ marginLeft: 4 }} />
        <span>{locationLabel(request)}</span>
      </div>

      {(request.contact_name || request.contact_phone || request.contact_email) && (
        <div style={{
          background: "rgba(246,244,238,.08)",
          border: "0.5px solid rgba(246,244,238,.15)",
          borderRadius: 14,
          padding: "14px 16px",
          display: "grid",
          gap: 10,
        }}>
          <Eyebrow style={{ color: "rgba(246,244,238,.45)", letterSpacing: ".16em" }}>
            {t("contact")}
          </Eyebrow>
          {request.contact_name && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--paper)" }}>
              <User size={14} style={{ opacity: 0.6, flexShrink: 0 }} />
              <span>{request.contact_name}</span>
            </div>
          )}
          {request.contact_phone && (
            <a
              href={`tel:${request.contact_phone}`}
              style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--paper)", textDecoration: "none", fontWeight: 600 }}
            >
              <Phone size={14} style={{ opacity: 0.6, flexShrink: 0 }} />
              <span>{request.contact_phone}</span>
            </a>
          )}
          {request.contact_email && (
            <a
              href={`mailto:${request.contact_email}`}
              style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--paper)", textDecoration: "none", fontWeight: 600 }}
            >
              <Mail size={14} style={{ opacity: 0.6, flexShrink: 0 }} />
              <span>{request.contact_email}</span>
            </a>
          )}
        </div>
      )}

      {request.arrival_instructions && (
        <div style={{
          background: "rgba(246,244,238,.08)",
          border: "0.5px solid rgba(246,244,238,.15)",
          borderRadius: 14,
          padding: "14px 16px",
          display: "grid",
          gap: 6,
        }}>
          <Eyebrow style={{ color: "rgba(246,244,238,.45)", letterSpacing: ".16em" }}>
            {t("arrival")}
          </Eyebrow>
          <p style={{ margin: 0, fontSize: 13, color: "rgba(246,244,238,.78)", lineHeight: 1.5 }}>
            {request.arrival_instructions}
          </p>
        </div>
      )}

      {showCheckIn && (
        <CheckInCard assignment={assignment} t={t} onCheckedIn={onCheckedIn} />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <a
          href={buildDirectionsUrl(request)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            borderRadius: 14,
            padding: "13px 14px",
            background: "var(--terra)",
            color: "var(--paper)",
            fontWeight: 600,
            fontSize: 14,
            textDecoration: "none",
            minHeight: 44,
          }}
        >
          <Navigation size={15} />
          {t("directions")}
        </a>
        <a
          href={buildCalendarUrl(request)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            borderRadius: 14,
            padding: "13px 14px",
            background: "rgba(246,244,238,.10)",
            border: "0.5px solid rgba(246,244,238,.22)",
            color: "var(--paper)",
            fontWeight: 600,
            fontSize: 14,
            textDecoration: "none",
            minHeight: 44,
          }}
        >
          <Calendar size={15} />
          {t("addToCalendar")}
        </a>
      </div>
    </article>
  );
}

function CheckInCard({
  assignment,
  t,
  onCheckedIn,
}: {
  assignment: Assignment;
  t: ReturnType<typeof useTranslations>;
  onCheckedIn: (updated: Assignment) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkedInAt = assignment.checked_in_at;

  async function handleCheckIn() {
    setBusy(true);
    setError(null);
    let coords: { latitude: number; longitude: number } | undefined;
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      coords = await new Promise<{ latitude: number; longitude: number } | undefined>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
          () => resolve(undefined),
          { enableHighAccuracy: false, maximumAge: 60000, timeout: 5000 },
        );
      });
    }
    try {
      const updated = await checkInAssignment(assignment.id, coords);
      onCheckedIn(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check-in failed");
    } finally {
      setBusy(false);
    }
  }

  if (checkedInAt) {
    return (
      <div style={{
        background: "rgba(168,217,184,.12)",
        border: "0.5px solid rgba(168,217,184,.3)",
        borderRadius: 14,
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}>
        <CheckCircle2 size={18} style={{ color: "#A8D9B8", flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <Eyebrow style={{ color: "rgba(168,217,184,.7)", letterSpacing: ".16em" }}>
            {t("checkedIn")}
          </Eyebrow>
          <div style={{ fontSize: 13, color: "var(--paper)", marginTop: 2 }}>
            {checkedInAt.slice(11, 16)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: "rgba(246,244,238,.08)",
      border: "0.5px solid rgba(246,244,238,.15)",
      borderRadius: 14,
      padding: "14px 16px",
      display: "grid",
      gap: 10,
    }}>
      <Eyebrow style={{ color: "rgba(246,244,238,.45)", letterSpacing: ".16em" }}>
        {t("arrivalCheckIn")}
      </Eyebrow>
      <p style={{ margin: 0, fontSize: 13, color: "rgba(246,244,238,.78)", lineHeight: 1.5 }}>
        {t("checkInHint")}
      </p>
      {error && (
        <p style={{ margin: 0, fontSize: 12, color: "#F2B5A8", fontWeight: 600 }}>{error}</p>
      )}
      <button
        type="button"
        onClick={handleCheckIn}
        disabled={busy}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          borderRadius: 12,
          padding: "12px 16px",
          background: "var(--moss)",
          border: "none",
          color: "#fff",
          fontWeight: 600,
          fontSize: 14,
          cursor: busy ? "wait" : "pointer",
          opacity: busy ? 0.6 : 1,
          fontFamily: "inherit",
          minHeight: 44,
        }}
      >
        <CheckCircle2 size={15} />
        {busy ? t("checkingIn") : t("checkInCta")}
      </button>
    </div>
  );
}

function buildDirectionsUrl(request: StaffingRequest): string {
  const org = request.organization;
  if (org?.latitude && org?.longitude) {
    return `https://www.google.com/maps/dir/?api=1&destination=${org.latitude},${org.longitude}`;
  }
  const parts = [request.location_name, org?.neighbourhood, request.city].filter(Boolean);
  const destination = encodeURIComponent(parts.join(", "));
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

function UpcomingRow({
  assignment,
  request,
  locale,
  last,
}: {
  assignment: Assignment;
  request: StaffingRequest;
  locale: "en" | "fr";
  last: boolean;
}) {
  return (
    <Link
      href={`/worker/requests/${request.id}/accepted`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 16px",
        borderBottom: last ? "none" : "0.5px solid var(--line-soft)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ fontFamily: "var(--serif)", fontSize: 18, width: 48, color: "var(--ink)", flexShrink: 0 }}>
        {request.work_date.slice(5)}
      </div>
      <div style={{ flex: 1, lineHeight: 1.25, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{request.organization?.name ?? request.title}</div>
        <Mono style={{ fontSize: 11, color: "var(--ink-3)", display: "block", marginTop: 2 }}>
          {request.start_time.slice(0, 5)}–{request.end_time.slice(0, 5)}
        </Mono>
      </div>
      <Chip
        variant={assignment.status === "confirmed" ? "moss" : "sand"}
        dot
        style={{ flexShrink: 0 }}
      >
        {assignmentStatusLabel(assignment.status, locale)}
      </Chip>
      <ChevronRight size={16} style={{ color: "var(--ink-3)", flexShrink: 0 }} />
    </Link>
  );
}

function PastCard({
  assignment,
  request,
  locale,
}: {
  assignment: Assignment;
  request: StaffingRequest;
  locale: "en" | "fr";
}) {
  return (
    <Link
      href={`/worker/requests/${request.id}/accepted`}
      style={{
        background: "var(--card)",
        border: "0.5px solid var(--line)",
        borderRadius: 14,
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        opacity: 0.7,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{request.organization?.name ?? request.title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, color: "var(--ink-3)", fontSize: 12 }}>
          <Calendar size={12} />
          <span>{formatWorkDate(request.work_date, locale)}</span>
          <span>·</span>
          <Mono style={{ fontSize: 11 }}>
            {request.start_time.slice(0, 5)}–{request.end_time.slice(0, 5)}
          </Mono>
        </div>
      </div>
      <Chip
        variant={assignment.status === "cancelled" ? "urgent" : "default"}
        dot
        style={{ flexShrink: 0 }}
      >
        {assignmentStatusLabel(assignment.status, locale)}
      </Chip>
    </Link>
  );
}

function buildCalendarUrl(request: StaffingRequest): string {
  const start = `${request.work_date.replace(/-/g, "")}T${request.start_time.slice(0, 5).replace(":", "")}00`;
  const end = `${request.work_date.replace(/-/g, "")}T${request.end_time.slice(0, 5).replace(":", "")}00`;
  const location = request.location_name ? `${request.location_name}, ${request.city}` : request.city;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: request.title,
    dates: `${start}/${end}`,
    location,
    details: request.arrival_instructions || "",
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
