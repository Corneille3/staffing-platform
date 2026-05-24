import Link from "next/link";
import { notFound } from "next/navigation";
import { Eyebrow, Mono } from "../../../../../components/ui";
import { getApfOrgSnapshot } from "../../../../../lib/api";
import type { OrgRequestRow } from "../../../../../lib/types";

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

export default async function OrgDrillInPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let snapshot;
  try {
    snapshot = await getApfOrgSnapshot(id);
  } catch {
    notFound();
  }

  const { kpis, status_breakdown, recent_closed_requests, upcoming_open_requests } = snapshot;

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <Link
          href="/apf/organizations"
          style={{ fontSize: 13, color: "var(--ink-3)", textDecoration: "none" }}
        >
          ← All organizations
        </Link>
      </div>

      <section style={{ marginBottom: 32 }}>
        <Eyebrow style={{ marginBottom: 12 }}>Organization</Eyebrow>
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
          {snapshot.name}
        </h1>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 20,
            flexWrap: "wrap",
            marginTop: 12,
          }}
        >
          <p style={{ margin: 0, color: "var(--ink-2)", lineHeight: 1.55, fontSize: 15 }}>
            {ORG_TYPE_LABELS[snapshot.type] ?? snapshot.type} · {snapshot.city}
            {snapshot.region ? `, ${snapshot.region}` : ""}
            {snapshot.contact_email ? ` · ${snapshot.contact_email}` : ""}
          </p>
          <Link
            href={`/apf/activity?org_id=${snapshot.id}`}
            style={{
              padding: "10px 18px",
              borderRadius: 999,
              background: "transparent",
              border: "0.5px solid var(--line)",
              color: "var(--ink)",
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            View full activity →
          </Link>
        </div>
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
          label="Unfilled requests"
          value={kpis.unfilled_count}
          accent={kpis.unfilled_count > 0 ? "var(--rose)" : "var(--moss)"}
          sub="open, notified, or awaiting response"
        />
        <MetricCard
          label="Substitutes in city"
          value={kpis.active_substitutes_in_city}
          sub={`currently available in ${snapshot.city}`}
        />
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 16,
          marginBottom: 28,
        }}
      >
        <Panel title="Status breakdown" subtitle={`${kpis.total_requests} total`}>
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
                      }}
                    />
                  </div>
                </div>
              );
            })}
            {Object.keys(status_breakdown).length === 0 && (
              <p style={{ margin: 0, color: "var(--ink-3)", fontSize: 13 }}>
                No requests yet for this organization.
              </p>
            )}
          </div>
        </Panel>

        <Panel title="Upcoming open" subtitle={`${upcoming_open_requests.length}`}>
          {upcoming_open_requests.length === 0 ? (
            <p style={{ margin: 0, color: "var(--ink-3)", fontSize: 13 }}>
              No open requests scheduled.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {upcoming_open_requests.map((r) => (
                <RequestRow key={r.id} row={r} />
              ))}
            </div>
          )}
        </Panel>
      </section>

      {recent_closed_requests.length > 0 && (
        <section>
          <Panel title="Recent closed" subtitle="last 8">
            <div style={{ display: "grid", gap: 8 }}>
              {recent_closed_requests.map((r) => (
                <RequestRow key={r.id} row={r} />
              ))}
            </div>
          </Panel>
        </section>
      )}
    </>
  );
}

function RequestRow({ row }: { row: OrgRequestRow }) {
  const accent = STATUS_ACCENT[row.status] ?? "var(--ink-3)";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 12,
        padding: "12px 16px",
        borderRadius: "var(--r-sm)",
        background: "var(--paper)",
        border: "0.5px solid var(--line)",
        alignItems: "center",
      }}
    >
      <div>
        <div style={{ fontWeight: 500, fontSize: 14, color: "var(--ink)" }}>{row.title}</div>
        <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
          {row.city} · {row.work_date}
        </div>
      </div>
      <span
        style={{
          borderRadius: 999,
          padding: "3px 10px",
          background: "var(--card)",
          color: accent,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          border: `0.5px solid ${accent}`,
        }}
      >
        {STATUS_LABELS[row.status] ?? row.status}
      </span>
    </div>
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
          fontSize: 36,
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
