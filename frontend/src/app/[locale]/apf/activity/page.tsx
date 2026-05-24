import Link from "next/link";
import { Eyebrow, Mono } from "../../../../components/ui";
import { ApfActivityList } from "../../../../components/apf-activity-list";
import { getApfActivity, getOrganizations } from "../../../../lib/api";
import type { ApfActivityFilter } from "../../../../lib/types";

const FILTERS: { key: ApfActivityFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "assigned", label: "Assigned" },
  { key: "cancelled", label: "Cancelled" },
  { key: "escalated", label: "Escalated" },
  { key: "invitations", label: "Invitations" },
  { key: "removals", label: "Removals" },
];

function normalizeFilter(value: string | string[] | undefined): ApfActivityFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  if (FILTERS.some((f) => f.key === raw)) return raw as ApfActivityFilter;
  return "all";
}

function singleString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function withOrg(href: string, orgId: string | undefined): string {
  if (!orgId) return href;
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}org_id=${orgId}`;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filter = normalizeFilter(params.filter);
  const orgId = singleString(params.org_id);

  const [initial, orgs] = await Promise.all([
    getApfActivity({ filter, orgId }),
    orgId ? getOrganizations() : Promise.resolve([]),
  ]);
  const { items, next_cursor, counts } = initial;
  const scopeOrg = orgId ? orgs.find((o) => o.id === orgId) : undefined;

  return (
    <>
      <section style={{ marginBottom: 24 }}>
        <Eyebrow style={{ marginBottom: 12 }}>Activity History</Eyebrow>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
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
            Network-wide audit <em style={{ fontStyle: "italic" }}>feed</em>.
          </h1>
          <Link
            href={orgId ? `/apf/export?org_id=${orgId}` : "/apf/export"}
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
            Export →
          </Link>
        </div>
        <p style={{ margin: "12px 0 0", maxWidth: 720, color: "var(--ink-2)", lineHeight: 1.55, fontSize: 15 }}>
          Every significant action across the network — requests created, workers notified, responses
          received, assignments confirmed and cancelled. Read-only, newest first.
        </p>
      </section>

      {scopeOrg && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 16,
            padding: "6px 12px",
            borderRadius: 999,
            background: "var(--terra-soft)",
            border: "0.5px solid var(--terra)",
            color: "var(--terra-ink)",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <span>
            In <strong style={{ fontWeight: 500 }}>{scopeOrg.name}</strong>
          </span>
          <Link
            href={filter === "all" ? "/apf/activity" : `/apf/activity?filter=${filter}`}
            style={{
              color: "var(--terra-ink)",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            ×
          </Link>
        </div>
      )}

      <nav
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 24,
          paddingBottom: 16,
          borderBottom: "0.5px solid var(--line)",
        }}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count = counts[f.key];
          return (
            <Link
              key={f.key}
              href={withOrg(f.key === "all" ? "/apf/activity" : `/apf/activity?filter=${f.key}`, orgId)}
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
              <span
                style={{
                  fontSize: 11,
                  color: active ? "var(--paper)" : "var(--ink-3)",
                  opacity: active ? 0.7 : 1,
                }}
              >
                <Mono>{count}</Mono>
              </span>
            </Link>
          );
        })}
      </nav>

      <ApfActivityList
        key={`${filter}-${orgId ?? "all"}`}
        filter={filter}
        initialRows={items}
        initialCursor={next_cursor}
        orgId={orgId}
      />
    </>
  );
}
