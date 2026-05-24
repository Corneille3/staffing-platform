import Link from "next/link";
import { Eyebrow, Mono } from "../../../components/ui";
import { ActivityRowCard } from "../../../components/apf-activity-row";
import { AdminDashboardUrgentCard } from "../../../components/admin-dashboard-urgent";
import { getAdminDashboard, getAdminOrganizations } from "../../../lib/api";
import type { AdminRequestSummary } from "../../../lib/types";

const ROLE_LABEL: Record<string, string> = {
  educator: "Educator",
  assistant_educator: "Assistant educator",
  psw: "PSW",
  nurse: "Nurse",
  food_handler: "Food handler",
  other: "Staff",
};
const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  notified: "Notified",
  responses_received: "Responses in",
  assigned: "Filled",
};
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

export default async function AdminDashboardPage() {
  const [dash, sites] = await Promise.all([getAdminDashboard(), getAdminOrganizations()]);
  const siteNames = Object.fromEntries(sites.map((s) => [s.id, s.name]));
  const { coordinator, urgent_now, kpis, live_requests, activity_today, week_fill_rate, roster_today } = dash;

  const now = new Date();
  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const todayIdx = (now.getDay() + 6) % 7; // Mon=0..Sun=6

  const headline = urgent_now
    ? "You have one urgent to settle."
    : kpis.open_count > 0
      ? `${kpis.open_count} open request${kpis.open_count === 1 ? "" : "s"} in flight.`
      : "Everything's covered.";

  const kpiTiles = [
    {
      label: "Fill rate this week",
      value: `${kpis.fill_rate_week}%`,
      color: fillColor(kpis.fill_rate_week),
      sub: kpis.fill_rate_delta === 0 ? "—" : `${kpis.fill_rate_delta > 0 ? "▲" : "▼"} ${Math.abs(kpis.fill_rate_delta)} pts vs last wk`,
    },
    { label: "Avg time-to-fill", value: fmtDuration(kpis.avg_time_to_fill_minutes), sub: "request → assigned" },
    { label: "Open right now", value: `${kpis.open_count}`, sub: "awaiting action" },
    { label: "Substitutes ready", value: `${kpis.substitutes_ready}`, sub: "available now", color: "var(--moss)" },
  ];

  return (
    <div>
      {/* 1 · Hero */}
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
        <div>
          <Eyebrow style={{ marginBottom: 6 }}>{greeting()}, {coordinator.first_name} · {clock}</Eyebrow>
          <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: "clamp(2rem, 4vw, 2.9rem)", lineHeight: 1.05, fontWeight: 500, color: "var(--ink)" }}>
            {headline.split(" ")[0]} <em style={{ fontStyle: "italic" }}>{headline.split(" ").slice(1).join(" ")}</em>
          </h1>
        </div>
        <Link href="/admin/requests/new" style={{ padding: "10px 18px", borderRadius: 999, background: "var(--ink)", color: "var(--paper)", fontSize: 14, fontWeight: 500, textDecoration: "none", whiteSpace: "nowrap" }}>
          + New request
        </Link>
      </header>

      {/* 2 · Urgent now */}
      {urgent_now ? (
        <AdminDashboardUrgentCard urgent={urgent_now} siteName={siteNames[urgent_now.organization_id] ?? ""} />
      ) : (
        <div style={{ background: "var(--moss-soft)", border: "0.5px solid #C8DCC1", borderRadius: "var(--r-md)", padding: 22, marginBottom: 22 }}>
          <h2 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 22, fontWeight: 400, color: "var(--moss)" }}>
            Nothing <em style={{ fontStyle: "italic" }}>urgent</em>.
          </h2>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--ink-2)" }}>No urgent unassigned requests right now.</p>
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

      {/* 4 · Two-up: live requests | today activity */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 22, alignItems: "start", marginBottom: 22 }}>
        <section>
          <PanelHeader title="Live requests" href="/admin/requests" linkLabel="All requests →" />
          <div style={{ display: "grid", gap: 8 }}>
            {live_requests.length === 0 ? (
              <p style={{ color: "var(--ink-3)", fontSize: 13 }}>Nothing else in the queue.</p>
            ) : (
              live_requests.map((r) => <LiveRow key={r.id} r={r} siteName={siteNames[r.organization_id] ?? ""} />)
            )}
          </div>
        </section>

        <section>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 18, fontWeight: 400, color: "var(--ink)" }}>Today</h3>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: ".1em", color: "var(--moss)" }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--moss)" }} /> LIVE
            </span>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {activity_today.length === 0 ? (
              <p style={{ color: "var(--ink-3)", fontSize: 13 }}>No activity yet today.</p>
            ) : (
              activity_today.map((row) => <ActivityRowCard key={row.id} row={row} />)
            )}
          </div>
        </section>
      </div>

      {/* 5 · Bottom row: this week | working today */}
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 22, alignItems: "start" }}>
        <section style={{ background: "var(--card)", border: "0.5px solid var(--line)", borderRadius: "var(--r-md)", padding: 18 }}>
          <Eyebrow style={{ marginBottom: 16 }}>This week · fill rate</Eyebrow>
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
          <PanelHeader title="Working today" href="/admin/activity" linkLabel="Activity →" />
          <div style={{ display: "grid", gap: 8 }}>
            {roster_today.length === 0 ? (
              <p style={{ color: "var(--ink-3)", fontSize: 13 }}>No substitutes scheduled today.</p>
            ) : (
              roster_today.map((p, i) => (
                <div key={i} style={{ background: "var(--card)", border: "0.5px solid var(--line)", borderRadius: 12, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{p.role ?? "Staff"} · <Mono style={{ fontSize: 12 }}>{p.starts_at.slice(0, 5)}→{p.ends_at.slice(0, 5)}</Mono></div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: p.status === "on_site" ? "var(--moss)" : "var(--sand)" }}>
                    {p.status === "on_site" ? "On site" : p.status === "en_route" ? "En route" : "Arriving"}
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

function LiveRow({ r, siteName }: { r: AdminRequestSummary; siteName: string }) {
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
            {r.role ? ROLE_LABEL[r.role] ?? r.role : "Staff"} <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>· {siteName}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
            <Mono style={{ fontSize: 12 }}>{r.start_time.slice(0, 5)}→{r.end_time.slice(0, 5)}</Mono> · {r.work_date} · {r.metrics.accepted} accepted
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: r.status === "responses_received" ? "var(--terra)" : "var(--ink-3)", whiteSpace: "nowrap" }}>
          {STATUS_LABEL[r.status] ?? r.status}
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
