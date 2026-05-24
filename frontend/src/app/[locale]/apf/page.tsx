import Link from "next/link";
import { Eyebrow, Mono } from "../../../components/ui";
import { getApfSnapshot } from "../../../lib/api";

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
  draft: "var(--ink-3)",
  open: "var(--sand)",
  notified: "var(--sand)",
  responses_received: "var(--sand)",
  assigned: "var(--moss)",
  completed: "var(--moss)",
  cancelled: "var(--rose)",
  expired: "var(--ink-3)",
};

const ORG_TYPE_LABELS: Record<string, string> = {
  childcare: "Childcare",
  long_term_care: "Long-term care",
  community_care: "Community care",
  home_care: "Home care",
  assisted_living: "Assisted living",
  other: "Other",
};

const CARD_STYLE: React.CSSProperties = {
  background: "var(--card)",
  border: "0.5px solid var(--line)",
};

export default async function ApfHomePage() {
  const snapshot = await getApfSnapshot();
  const { kpis, status_breakdown, shortage_cities, org_activity, recent_closed_requests } = snapshot;

  return (
    <>
      <section style={{ marginBottom: 32 }}>
        <Eyebrow style={{ marginBottom: 12 }}>Network Snapshot</Eyebrow>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--serif)",
            fontSize: "clamp(2rem, 4vw, 3.2rem)",
            lineHeight: 1.05,
            fontWeight: 400,
            color: "var(--ink)",
          }}
        >
          Network-wide staffing <em style={{ fontStyle: "italic" }}>health</em>.
        </h1>
        <p style={{ margin: "12px 0 0", maxWidth: 720, color: "var(--ink-2)", lineHeight: 1.55, fontSize: 15 }}>
          Aggregate visibility across every Staffig-affiliated organization. Read-only metrics for
          oversight, accountability, and pattern detection — not for day-to-day dispatch.
        </p>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
          marginBottom: 28,
        }}
      >
        <MetricCard
          label="Fill rate"
          value={`${kpis.fill_rate}%`}
          accent="var(--moss)"
          sub={`${kpis.filled_count} of ${kpis.total_requests} requests filled`}
        />
        <MetricCard
          label="Avg time to fill"
          value={kpis.avg_fill_hours != null ? `${kpis.avg_fill_hours}h` : "—"}
          sub="hours from creation to assignment"
        />
        <MetricCard
          label="Active substitutes"
          value={kpis.active_substitutes}
          sub="currently available"
        />
        <MetricCard
          label="Unfilled requests"
          value={kpis.unfilled_count}
          accent={kpis.unfilled_count > 0 ? "var(--rose)" : "var(--moss)"}
          sub="open, notified, or awaiting response"
        />
        <MetricCard label="Total requests" value={kpis.total_requests} sub="all time across all organizations" />
        <MetricCard label="Organizations" value={kpis.organizations_count} sub="affiliated with this network" />
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 0.7fr)",
          gap: 16,
          marginBottom: 28,
        }}
      >
        <Panel title="Request status breakdown">
          <div style={{ display: "grid", gap: 12 }}>
            {STATUS_ORDER.filter((s) => status_breakdown[s]).map((status) => {
              const count = status_breakdown[status] || 0;
              const pct = kpis.total_requests
                ? Math.round((count / kpis.total_requests) * 100)
                : 0;
              return (
                <div key={status} style={{ display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: "var(--ink)" }}>{STATUS_LABELS[status] ?? status}</span>
                    <span style={{ color: STATUS_ACCENT[status] ?? "var(--ink)" }}>
                      <Mono>{count}</Mono>
                    </span>
                  </div>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 99,
                      background: "var(--line-soft)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        borderRadius: 99,
                        width: `${pct}%`,
                        background: STATUS_ACCENT[status] ?? "var(--ink-3)",
                        transition: "width 0.3s",
                      }}
                    />
                  </div>
                </div>
              );
            })}
            {Object.keys(status_breakdown).length === 0 && (
              <p style={{ margin: 0, color: "var(--ink-3)", fontSize: 13 }}>No requests yet.</p>
            )}
          </div>
        </Panel>

        <Panel title="Shortage cities" subtitle={`${shortage_cities.length} flagged`}>
          {shortage_cities.length === 0 ? (
            <p style={{ margin: 0, color: "var(--ink-3)", fontSize: 13 }}>
              All open-request cities have at least one available substitute.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {shortage_cities.map((city) => (
                <div
                  key={city}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: "var(--r-sm)",
                    background: "var(--rose-soft)",
                    border: "0.5px solid var(--rose)",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "var(--rose)",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 14, color: "var(--ink)" }}>{city}</span>
                  <span style={{ fontSize: 12, color: "var(--ink-2)", marginLeft: "auto" }}>
                    no available substitute
                  </span>
                </div>
              ))}
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-3)" }}>
                Cities with open requests but zero available substitutes.
              </p>
            </div>
          )}
        </Panel>
      </section>

      <section style={{ marginBottom: 28 }}>
        <Panel title="Organization activity" subtitle={`${kpis.organizations_count} orgs`}>
          <div style={{ display: "grid", gap: 8 }}>
            {org_activity.map((row) => (
              <Link
                key={row.id}
                href={`/apf/organizations/${row.id}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.6fr repeat(3, 1fr)",
                  gap: 12,
                  padding: "14px 18px",
                  borderRadius: "var(--r-md)",
                  background: "var(--card)",
                  border: "0.5px solid var(--line)",
                  alignItems: "center",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div>
                  <strong style={{ fontSize: 15, color: "var(--ink)", fontWeight: 500 }}>{row.name}</strong>
                  <div style={{ marginTop: 3, fontSize: 12, color: "var(--ink-3)" }}>
                    {row.city}
                    {row.region ? `, ${row.region}` : ""} ·{" "}
                    {ORG_TYPE_LABELS[row.type] ?? row.type}
                  </div>
                </div>
                <Stat label="Total" value={row.total} />
                <Stat label="Filled" value={row.filled} accent="var(--moss)" />
                <Stat
                  label="Open"
                  value={row.open}
                  accent={row.open > 0 ? "var(--rose)" : undefined}
                />
              </Link>
            ))}
            {org_activity.length === 0 && (
              <p style={{ margin: 0, color: "var(--ink-3)" }}>No organizations yet.</p>
            )}
          </div>
        </Panel>
      </section>

      {recent_closed_requests.length > 0 && (
        <section>
          <Panel title="Recent closed requests" subtitle="last 8">
            <div style={{ display: "grid", gap: 8 }}>
              {recent_closed_requests.map((r) => {
                const accent = STATUS_ACCENT[r.status] ?? "var(--ink-3)";
                return (
                  <div
                    key={r.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 12,
                      padding: "12px 16px",
                      borderRadius: "var(--r-sm)",
                      background: "var(--card)",
                      border: "0.5px solid var(--line)",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 14, color: "var(--ink)" }}>
                        {r.title}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                        {r.organization_name ?? "Unknown org"} · {r.city} · {r.work_date}
                      </div>
                    </div>
                    <span
                      style={{
                        borderRadius: 999,
                        padding: "3px 10px",
                        background: "var(--paper)",
                        color: accent,
                        fontSize: 11,
                        fontWeight: 500,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                        border: `0.5px solid ${accent}`,
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
    </>
  );
}

function MetricCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        ...CARD_STYLE,
        padding: "20px 22px",
        borderRadius: "var(--r-md)",
      }}
    >
      <Eyebrow>{label}</Eyebrow>
      <p
        style={{
          margin: "12px 0 0",
          fontFamily: "var(--serif)",
          fontSize: 38,
          fontWeight: 400,
          color: accent || "var(--ink)",
          lineHeight: 1,
        }}
      >
        {value}
      </p>
      {sub && (
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--ink-3)", lineHeight: 1.4 }}>
          {sub}
        </p>
      )}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        ...CARD_STYLE,
        padding: 24,
        borderRadius: "var(--r-lg)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 18,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500, color: "var(--ink)" }}>{title}</h2>
        {subtitle && (
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            <Mono>{subtitle}</Mono>
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <div
        style={{
          fontFamily: "var(--serif)",
          fontSize: 24,
          fontWeight: 400,
          color: accent || "var(--ink)",
          lineHeight: 1.1,
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}
