import Link from "next/link";
import { Eyebrow, Mono } from "../../../../components/ui";
import { AdminActivityList } from "../../../../components/admin-activity-list";
import { getAdminActivity } from "../../../../lib/api";
import type { AdminActivityFilter } from "../../../../lib/types";

const FILTERS: { key: AdminActivityFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "posted", label: "Posted" },
  { key: "accepted", label: "Accepted" },
  { key: "declined", label: "Declined" },
  { key: "assigned", label: "Assigned" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "expired", label: "Expired" },
  { key: "invited", label: "Invited" },
];

function normalizeFilter(value: string | string[] | undefined): AdminActivityFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  if (FILTERS.some((f) => f.key === raw)) return raw as AdminActivityFilter;
  return "all";
}

function singleString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function withSite(href: string, siteId: string | undefined): string {
  if (!siteId) return href;
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}site_id=${siteId}`;
}

function fmtDuration(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filter = normalizeFilter(params.filter);
  const siteId = singleString(params.site_id);

  const { items, next_cursor, counts, kpis } = await getAdminActivity({ filter, siteId });
  const cancelPct = kpis.posted ? Math.round((100 * kpis.cancelled) / kpis.posted) : 0;

  const kpiTiles: { label: string; value: string; sub: string; color?: string }[] = [
    { label: "Requests posted", value: `${kpis.posted}`, sub: `${kpis.sites} site${kpis.sites === 1 ? "" : "s"}` },
    { label: "Filled", value: `${kpis.filled}`, sub: `${kpis.fill_rate}% rate`, color: "var(--moss)" },
    { label: "Cancelled", value: `${kpis.cancelled}`, sub: `${cancelPct}% of total`, color: "var(--rose)" },
    { label: "Expired", value: `${kpis.expired}`, sub: "no fill in time", color: kpis.expired > 0 ? "var(--rose)" : undefined },
    { label: "Avg time-to-fill", value: fmtDuration(kpis.avg_time_to_fill_minutes), sub: "request → assigned" },
  ];

  return (
    <div>
      <header style={{ marginBottom: 26 }}>
        <Eyebrow style={{ marginBottom: 6 }}>Audit history</Eyebrow>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--serif)",
            fontSize: "clamp(2rem, 4vw, 2.9rem)",
            lineHeight: 1.05,
            fontWeight: 500,
            color: "var(--ink)",
          }}
        >
          Every move, <em style={{ fontStyle: "italic" }}>logged</em>.
        </h1>
        <p style={{ margin: "10px 0 0", maxWidth: 720, fontSize: 14, lineHeight: 1.55, color: "var(--ink-2)" }}>
          The full timeline across your sites — read-only, newest first. For reporting, compliance, and
          &ldquo;what happened on Thursday?&rdquo;.
        </p>
      </header>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 22 }}>
        {kpiTiles.map((k) => (
          <div key={k.label} style={{ background: "var(--card)", border: "0.5px solid var(--line)", borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ink-3)" }}>{k.label}</div>
            <Mono style={{ fontSize: 24, fontWeight: 600, color: k.color ?? "var(--ink)" }}>{k.value}</Mono>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Filter chips */}
      <nav style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24, paddingBottom: 16, borderBottom: "0.5px solid var(--line)" }}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count = counts[f.key];
          return (
            <Link
              key={f.key}
              href={withSite(f.key === "all" ? "/admin/activity" : `/admin/activity?filter=${f.key}`, siteId)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 14px",
                borderRadius: 999,
                background: active ? "var(--ink)" : "var(--card)",
                color: active ? "var(--paper)" : "var(--ink)",
                border: `0.5px solid ${active ? "var(--ink)" : "var(--line)"}`,
                fontSize: 13,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              {f.label}
              <Mono style={{ fontSize: 11, opacity: 0.7 }}>{count}</Mono>
            </Link>
          );
        })}
      </nav>

      {/* key forces a remount on filter/site change so the client list
          re-initialises with the freshly fetched (filtered) rows. */}
      <AdminActivityList
        key={`${filter}:${siteId ?? ""}`}
        filter={filter}
        initialRows={items}
        initialCursor={next_cursor}
        siteId={siteId}
      />
    </div>
  );
}
