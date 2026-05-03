import { getNetworkOverview, getOrganizations, getRequests } from "../../lib/api";

const STATUS_ORDER = [
  "draft", "open", "notified", "responses_received",
  "assigned", "completed", "cancelled", "expired",
];

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  open: "Open",
  notified: "Notified",
  responses_received: "Responses received",
  assigned: "Assigned",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
};

const STATUS_ACCENT: Record<string, string> = {
  draft: "#888",
  open: "#a4c8a3",
  notified: "#88b8d4",
  responses_received: "#c8b88c",
  assigned: "#a4c8a3",
  completed: "#6db896",
  cancelled: "#d6806a",
  expired: "#888",
};

const ORG_TYPE_LABELS: Record<string, string> = {
  childcare: "Childcare",
  long_term_care: "Long-term care",
  community_care: "Community care",
  home_care: "Home care",
  assisted_living: "Assisted living",
  other: "Other",
};

export default async function ApfHomePage() {
  const [overview, organizations, requests] = await Promise.all([
    getNetworkOverview(),
    getOrganizations(),
    getRequests(),
  ]);

  const orgMap = new Map(organizations.map((o) => [o.id, o]));

  const recentClosed = [...requests]
    .filter((r) => ["assigned", "completed", "cancelled", "expired"].includes(r.status))
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .slice(0, 8);

  const orgActivity = organizations.map((org) => {
    const orgRequests = requests.filter((r) => r.organization_id === org.id);
    const filled = orgRequests.filter((r) => ["assigned", "completed"].includes(r.status)).length;
    const open = orgRequests.filter((r) =>
      ["open", "notified", "responses_received"].includes(r.status),
    ).length;
    return { org, total: orgRequests.length, filled, open };
  }).sort((a, b) => b.total - a.total);

  return (
    <main style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 20px 80px" }}>
      {/* Header */}
      <section style={{ marginBottom: 36 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.24em", textTransform: "uppercase", opacity: 0.6 }}>
          Network Snapshot
        </p>
        <h1 style={{ margin: "10px 0 8px", fontSize: "clamp(2rem, 4vw, 3.4rem)", lineHeight: 1.05 }}>
          Network-wide staffing health.
        </h1>
        <p style={{ margin: 0, maxWidth: 720, opacity: 0.72, lineHeight: 1.55 }}>
          Aggregate visibility across every APF-affiliated organization. Read-only metrics for
          oversight, accountability, and pattern detection — not for day-to-day dispatch.
        </p>
      </section>

      {/* Primary KPIs */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 14,
          marginBottom: 28,
        }}
      >
        <MetricCard label="Fill rate" value={`${overview.fill_rate}%`} accent="#a4c8a3"
          sub={`${overview.filled_count} of ${overview.total_requests} requests filled`} />
        <MetricCard label="Avg time to fill"
          value={overview.avg_fill_hours != null ? `${overview.avg_fill_hours}h` : "—"}
          sub="hours from creation to assignment" />
        <MetricCard label="Active substitutes" value={overview.active_substitutes}
          accent="#88b8d4" sub="currently available" />
        <MetricCard label="Unfilled requests" value={overview.unfilled_count}
          accent={overview.unfilled_count > 0 ? "#d6a08c" : "#a4c8a3"}
          sub="open, notified, or awaiting response" />
        <MetricCard label="Total requests" value={overview.total_requests}
          sub="all time across all organizations" />
        <MetricCard label="Organizations" value={organizations.length}
          sub="affiliated with this network" />
      </section>

      {/* Two-column: status breakdown + shortage cities */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 0.7fr)",
          gap: 20,
          marginBottom: 28,
        }}
      >
        <Panel title="Request status breakdown">
          <div style={{ display: "grid", gap: 10 }}>
            {STATUS_ORDER.filter((s) => overview.status_breakdown[s]).map((status) => {
              const count = overview.status_breakdown[status] || 0;
              const pct = overview.total_requests ? Math.round((count / overview.total_requests) * 100) : 0;
              return (
                <div key={status} style={{ display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ opacity: 0.85 }}>{STATUS_LABELS[status] ?? status}</span>
                    <span style={{ fontWeight: 700, color: STATUS_ACCENT[status] ?? "#f3ead4" }}>
                      {count}
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: "rgba(247,240,223,0.1)" }}>
                    <div
                      style={{
                        height: "100%",
                        borderRadius: 99,
                        width: `${pct}%`,
                        background: STATUS_ACCENT[status] ?? "rgba(247,240,223,0.4)",
                        transition: "width 0.3s",
                      }}
                    />
                  </div>
                </div>
              );
            })}
            {Object.keys(overview.status_breakdown).length === 0 && (
              <p style={{ margin: 0, opacity: 0.5, fontSize: 13 }}>No requests yet.</p>
            )}
          </div>
        </Panel>

        <Panel title="Shortage cities" subtitle={`${overview.shortage_cities.length} flagged`}>
          {overview.shortage_cities.length === 0 ? (
            <p style={{ margin: 0, opacity: 0.6, fontSize: 13 }}>
              All open-request cities have at least one available substitute.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {overview.shortage_cities.map((city) => (
                <div
                  key={city}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 10,
                    background: "rgba(214, 128, 106, 0.12)",
                    border: "1px solid rgba(214, 128, 106, 0.25)",
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#d6806a", flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{city}</span>
                  <span style={{ fontSize: 12, opacity: 0.6, marginLeft: "auto" }}>no available substitute</span>
                </div>
              ))}
              <p style={{ margin: "4px 0 0", fontSize: 12, opacity: 0.5 }}>
                Cities with open requests but zero available substitutes.
              </p>
            </div>
          )}
        </Panel>
      </section>

      {/* Organization activity */}
      <section style={{ marginBottom: 28 }}>
        <Panel title="Organization activity" subtitle={`${organizations.length} orgs`}>
          <div style={{ display: "grid", gap: 10 }}>
            {orgActivity.map(({ org, total, filled, open }) => (
              <div
                key={org.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.6fr repeat(3, 1fr)",
                  gap: 12,
                  padding: "14px 18px",
                  borderRadius: 14,
                  background: "rgba(247, 240, 223, 0.04)",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong style={{ fontSize: 15 }}>{org.name}</strong>
                  <div style={{ marginTop: 3, fontSize: 12, opacity: 0.6 }}>
                    {org.city}{org.region ? `, ${org.region}` : ""} · {ORG_TYPE_LABELS[org.type] ?? org.type}
                  </div>
                </div>
                <Stat label="Total" value={total} />
                <Stat label="Filled" value={filled} accent="#a4c8a3" />
                <Stat label="Open" value={open} accent={open > 0 ? "#d6a08c" : undefined} />
              </div>
            ))}
            {orgActivity.length === 0 && (
              <p style={{ margin: 0, opacity: 0.5 }}>No organizations yet.</p>
            )}
          </div>
        </Panel>
      </section>

      {/* Recent closed requests */}
      {recentClosed.length > 0 && (
        <section>
          <Panel title="Recent closed requests" subtitle="last 8">
            <div style={{ display: "grid", gap: 10 }}>
              {recentClosed.map((r) => {
                const org = orgMap.get(r.organization_id);
                const accent = STATUS_ACCENT[r.status] ?? "#888";
                return (
                  <div
                    key={r.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 12,
                      padding: "12px 16px",
                      borderRadius: 12,
                      background: "rgba(247, 240, 223, 0.04)",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{r.title}</div>
                      <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                        {org?.name ?? "Unknown org"} · {r.city} · {r.work_date}
                      </div>
                    </div>
                    <span
                      style={{
                        borderRadius: 999,
                        padding: "3px 10px",
                        background: `${accent}22`,
                        color: accent,
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </Panel>
        </section>
      )}

      <p style={{ marginTop: 32, opacity: 0.45, fontSize: 13 }}>
        APF oversight surface · read-only · D2 Substitute Pool + D3 Activity History coming next.
      </p>
    </main>
  );
}

function MetricCard({
  label, value, sub, accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        padding: "20px 22px",
        borderRadius: 18,
        background: "rgba(247, 240, 223, 0.06)",
        border: "1px solid rgba(247, 240, 223, 0.12)",
      }}
    >
      <p style={{ margin: 0, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.6 }}>
        {label}
      </p>
      <p style={{ margin: "10px 0 0", fontSize: 36, fontWeight: 700, color: accent || "#f3ead4", lineHeight: 1 }}>
        {value}
      </p>
      {sub && <p style={{ margin: "6px 0 0", fontSize: 12, opacity: 0.5, lineHeight: 1.4 }}>{sub}</p>}
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 24,
        borderRadius: 22,
        background: "rgba(247, 240, 223, 0.06)",
        border: "1px solid rgba(247, 240, 223, 0.1)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
        {subtitle && <span style={{ fontSize: 13, opacity: 0.55 }}>{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.55 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent || "#f3ead4", lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}
