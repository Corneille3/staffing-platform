import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Link } from "../../../i18n/navigation";
import { Eyebrow, Mono } from "../../../components/ui";
import { ActivityRowCard } from "../../../components/apf-activity-row";
import { AdminDashboardUrgentCard } from "../../../components/admin-dashboard-urgent";
import { PollingRefresh } from "../../../components/polling-refresh";
import { HideOnReadOnlyVisit } from "../../../components/read-only-visit";
import { getAdminDashboard, getAdminOrganizations } from "../../../lib/api";
import { shiftClock } from "../../../lib/shift-time";
import type { AdminCoverageForward, AdminRequestSummary } from "../../../lib/types";


function fmtDuration(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function fillColor(rate: number): string {
  if (rate >= 85) return "var(--moss)";
  if (rate >= 50) return "var(--sand)";
  return "var(--rose)";
}

function greetingKey(h: number): "greetingMorning" | "greetingAfternoon" | "greetingEvening" {
  if (h < 12) return "greetingMorning";
  if (h < 18) return "greetingAfternoon";
  return "greetingEvening";
}

export default async function AdminDashboardPage() {
  const t = await getTranslations("admin.dashboard");
  const tAdmin = await getTranslations("admin");
  const DAYS = t("weekdays").split(",");
  const [dash, sites] = await Promise.all([getAdminDashboard(), getAdminOrganizations()]);
  const siteNames = Object.fromEntries(sites.map((s) => [s.id, s.name]));
  const { coordinator, urgent_now, kpis, live_requests, activity_today, week_fill_rate, roster_today, coverage_forward } = dash;

  // Server component: this renders on Vercel in UTC, so take the clock in
  // the shift timezone (finding #18 — greeting, clock and week highlight
  // were all a day/4 h off in the evening).
  const { hour, minute, weekdayIdx: todayIdx } = shiftClock();
  const clock = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  const headline = urgent_now
    ? t("headlineUrgent")
    : kpis.open_count > 0
      ? t("headlineOpen", { count: kpis.open_count })
      : t("headlineCovered");

  const kpiTiles = [
    {
      label: t("kpiFillRate"),
      value: `${kpis.fill_rate_week}%`,
      color: fillColor(kpis.fill_rate_week),
      sub: kpis.fill_rate_delta === 0 ? "—" : t("kpiFillDelta", { arrow: kpis.fill_rate_delta > 0 ? "▲" : "▼", points: Math.abs(kpis.fill_rate_delta) }),
    },
    { label: t("kpiTimeToFill"), value: fmtDuration(kpis.avg_time_to_fill_minutes), sub: t("kpiTimeToFillSub") },
    { label: t("kpiOpen"), value: `${kpis.open_count}`, sub: t("kpiOpenSub") },
    { label: t("kpiReady"), value: `${kpis.substitutes_ready}`, sub: t("kpiReadySub"), color: "var(--moss)" },
  ];

  return (
    <div>
      {/* 5 s while a request is in flight (matches the request detail), 30 s otherwise. */}
      <PollingRefresh everyMs={30_000} activeMs={5_000} active={urgent_now !== null || live_requests.length > 0} />
      {/* 1 · Hero */}
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
        <div>
          <Eyebrow style={{ marginBottom: 6 }}>{t(greetingKey(hour))}, {coordinator.first_name} · {clock}</Eyebrow>
          <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: "clamp(2rem, 4vw, 2.9rem)", lineHeight: 1.05, fontWeight: 500, color: "var(--ink)" }}>
            {headline.split(" ")[0]} <em style={{ fontStyle: "italic" }}>{headline.split(" ").slice(1).join(" ")}</em>
          </h1>
        </div>
        <HideOnReadOnlyVisit>
          <Link href="/admin/requests/new" style={{ padding: "10px 18px", borderRadius: 999, background: "var(--ink)", color: "var(--paper)", fontSize: 14, fontWeight: 500, textDecoration: "none", whiteSpace: "nowrap" }}>
            {t("newRequest")}
          </Link>
        </HideOnReadOnlyVisit>
      </header>

      {/* 2 · Urgent now */}
      {urgent_now ? (
        <AdminDashboardUrgentCard urgent={urgent_now} siteName={siteNames[urgent_now.organization_id] ?? ""} />
      ) : (
        <div style={{ background: "var(--moss-soft)", border: "0.5px solid #C8DCC1", borderRadius: "var(--r-md)", padding: 22, marginBottom: 22 }}>
          <h2 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 22, fontWeight: 400, color: "var(--moss)" }}>
            {t("nothingLead")} <em style={{ fontStyle: "italic" }}>{t("nothingEm")}</em>.
          </h2>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--ink-2)" }}>{t("nothingBody")}</p>
        </div>
      )}

      {/* 3 · KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 22 }}>
        {kpiTiles.map((k) => (
          <div key={k.label} style={{ background: "var(--card)", border: "0.5px solid var(--line)", borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ink-3)" }}>{k.label}</div>
            <Mono style={{ fontSize: 24, fontWeight: 600, color: k.color ?? "var(--ink)" }}>{k.value}</Mono>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* 3b · Coverage — next 14 days */}
      <CoverageForwardCard coverage={coverage_forward} />

      {/* 4 · Two-up: live requests | today activity */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 22, alignItems: "start", marginBottom: 22 }}>
        <section>
          <PanelHeader title={t("liveRequests")} href="/admin/requests" linkLabel={t("allRequests")} />
          <div style={{ display: "grid", gap: 8 }}>
            {live_requests.length === 0 ? (
              <LiveRequestsEmptyState assignedCount={kpis.assigned_count} />
            ) : (
              live_requests.map((r) => <LiveRow key={r.id} r={r} siteName={siteNames[r.organization_id] ?? ""} />)
            )}
          </div>
        </section>

        <section>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 18, fontWeight: 400, color: "var(--ink)" }}>{t("today")}</h3>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: ".1em", color: "var(--moss)" }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--moss)" }} /> {t("live")}
            </span>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {activity_today.length === 0 ? (
              <p style={{ color: "var(--ink-3)", fontSize: 13 }}>{t("noActivity")}</p>
            ) : (
              activity_today.map((row) => <ActivityRowCard key={row.id} row={row} />)
            )}
          </div>
        </section>
      </div>

      {/* 5 · Bottom row: this week | working today */}
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 22, alignItems: "start" }}>
        <section style={{ background: "var(--card)", border: "0.5px solid var(--line)", borderRadius: "var(--r-md)", padding: 18 }}>
          <Eyebrow style={{ marginBottom: 16 }}>{t("weekFillRate")}</Eyebrow>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 120 }}>
            {week_fill_rate.map((rate, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
                  <div
                    style={{
                      width: "100%",
                      height: `${Math.max(rate, 3)}%`,
                      background: rate === 0 ? "var(--line)" : fillColor(rate),
                      borderRadius: 6,
                      opacity: i === todayIdx ? 1 : 0.55,
                    }}
                    title={`${DAYS[i]}: ${rate}%`}
                  />
                </div>
                <span style={{ fontSize: 10, color: i === todayIdx ? "var(--ink)" : "var(--ink-3)", fontWeight: i === todayIdx ? 700 : 500 }}>{DAYS[i]}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <PanelHeader title={t("workingToday")} href="/admin/activity" linkLabel={t("activityLink")} />
          <div style={{ display: "grid", gap: 8 }}>
            {roster_today.length === 0 ? (
              <p style={{ color: "var(--ink-3)", fontSize: 13 }}>{t("noRoster")}</p>
            ) : (
              roster_today.map((p, i) => (
                <div key={i} style={{ background: "var(--card)", border: "0.5px solid var(--line)", borderRadius: 12, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{p.role ?? tAdmin("roles.other")} · <Mono style={{ fontSize: 12 }}>{p.starts_at.slice(0, 5)}→{p.ends_at.slice(0, 5)}</Mono></div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: p.status === "on_site" || p.status === "done" ? "var(--moss)" : p.status === "not_checked_in" ? "var(--rose)" : "var(--sand)" }}>
                    {p.status === "on_site" ? t("rosterOnSite") : p.status === "done" ? t("rosterDone") : p.status === "not_checked_in" ? t("rosterNotCheckedIn") : p.status === "en_route" ? t("rosterEnRoute") : t("rosterArriving")}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}


function CoverageForwardCard({ coverage }: { coverage: AdminCoverageForward }) {
  const t = useTranslations("admin.dashboard");
  const DAY_LETTERS = t("dayLetters").split(","); // Date.getDay() order
  const { days, uncovered_total, urgent_48h, not_checked_in_today } = coverage;
  const risky = urgent_48h > 0;
  const maxCount = Math.max(1, ...days.map((d) => d.open + d.released + d.pending_approval + d.covered));
  const headline =
    uncovered_total === 0
      ? t("coverageAll")
      : t("coverageUncovered", { count: uncovered_total });

  return (
    <section style={{ background: "var(--card)", border: "0.5px solid var(--line)", borderRadius: "var(--r-md)", padding: 18, marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <Eyebrow style={{ marginBottom: 4 }}>{t("coverageEyebrow")}</Eyebrow>
          <span style={{ fontFamily: "var(--serif)", fontSize: 18, color: risky ? "var(--rose)" : uncovered_total > 0 ? "var(--ink)" : "var(--moss)" }}>
            {headline}
          </span>
          {risky && (
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: "var(--rose)" }}>
              {t("coverageWithin48", { count: urgent_48h })}
            </span>
          )}
        </div>
        {not_checked_in_today > 0 && (
          <span style={{ background: "var(--rose-soft)", border: "0.5px solid var(--rose)", borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 700, color: "var(--rose)" }}>
            {t("coverageNotCheckedIn", { count: not_checked_in_today })}
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 72 }}>
        {days.map((d) => {
          const uncovered = d.open + d.released + d.pending_approval;
          const total = uncovered + d.covered;
          const dayDate = new Date(`${d.date}T12:00:00`);
          const title = t("coverageTooltip", { date: d.date, open: d.open, released: d.released, pending: d.pending_approval, covered: d.covered });
          return (
            <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }} title={title}>
              <div style={{ flex: 1, width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 1 }}>
                {uncovered > 0 && (
                  <div style={{ width: "100%", height: `${(uncovered / maxCount) * 100}%`, minHeight: 6, background: "var(--rose)", borderRadius: 4 }} />
                )}
                {d.covered > 0 && (
                  <div style={{ width: "100%", height: `${(d.covered / maxCount) * 100}%`, minHeight: 6, background: "var(--moss)", opacity: 0.55, borderRadius: 4 }} />
                )}
                {total === 0 && <div style={{ width: "100%", height: 3, background: "var(--line)", borderRadius: 4 }} />}
              </div>
              <span style={{ fontSize: 9, color: "var(--ink-3)", fontWeight: 500 }}>
                {DAY_LETTERS[dayDate.getDay()]}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 11, color: "var(--ink-3)" }}>
        <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--rose)", marginRight: 5 }} />{t("uncovered")}</span>
        <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--moss)", opacity: 0.55, marginRight: 5 }} />{t("covered")}</span>
      </div>
    </section>
  );
}

function LiveRequestsEmptyState({ assignedCount }: { assignedCount: number }) {
  // Distinguish "nothing has happened yet" from "everything's handled" so a new
  // coordinator and a caught-up one don't see the same blank panel (E2E bug #7).
  const t = useTranslations("admin.dashboard");
  const allHandled = assignedCount > 0;
  return (
    <div
      style={{
        background: "var(--card)",
        border: "0.5px dashed var(--line)",
        borderRadius: "var(--r-md)",
        padding: "18px 16px",
        textAlign: "center",
      }}
    >
      <p style={{ margin: 0, fontSize: 13, color: "var(--ink-2)" }}>
        {allHandled
          ? t("emptyHandled")
          : t("emptyNone")}
      </p>
      {allHandled ? (
        <Link href="/admin/requests?tab=assigned" style={EMPTY_CTA_STYLE}>
          {t("viewAssigned", { count: assignedCount })}
        </Link>
      ) : (
        <HideOnReadOnlyVisit>
          <Link href="/admin/requests/new" style={EMPTY_CTA_STYLE}>
            {t("createFirst")}
          </Link>
        </HideOnReadOnlyVisit>
      )}
    </div>
  );
}

function LiveRow({ r, siteName }: { r: AdminRequestSummary; siteName: string }) {
  const t = useTranslations("admin");
  return (
    <Link href={`/admin/requests/${r.id}`} style={{ textDecoration: "none" }}>
      <div
        style={{
          background: r.urgent ? "var(--terra-soft)" : "var(--card)",
          border: "0.5px solid var(--line)",
          borderLeft: r.urgent ? "3px solid var(--terra)" : "0.5px solid var(--line)",
          borderRadius: 12,
          padding: "12px 14px",
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
            {r.role ? (t.has(`roles.${r.role}`) ? t(`roles.${r.role}`) : r.role) : t("roles.other")} <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>· {siteName}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
            <Mono style={{ fontSize: 12 }}>{r.start_time.slice(0, 5)}→{r.end_time.slice(0, 5)}</Mono> · {r.work_date} · {t("dashboard.acceptedCount", { count: r.metrics.accepted })}
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: r.status === "responses_received" ? "var(--terra)" : "var(--ink-3)", whiteSpace: "nowrap" }}>
          {t.has(`status.${r.status}`) ? t(`status.${r.status}`) : r.status}
        </span>
      </div>
    </Link>
  );
}

function PanelHeader({ title, href, linkLabel }: { title: string; href: string; linkLabel: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
      <h3 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 18, fontWeight: 400, color: "var(--ink)" }}>{title}</h3>
      <Link href={href} style={{ color: "var(--terra)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>{linkLabel}</Link>
    </div>
  );
}

const EMPTY_CTA_STYLE: React.CSSProperties = {
  display: "inline-block",
  marginTop: 8,
  fontSize: 13,
  fontWeight: 500,
  color: "var(--terra)",
  textDecoration: "none",
};
