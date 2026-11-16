import { getTranslations } from "next-intl/server";
import { Link } from "../../../../i18n/navigation";
import { Eyebrow, Mono } from "../../../../components/ui";
import { PollingRefresh } from "../../../../components/polling-refresh";
import { HideOnReadOnlyVisit } from "../../../../components/read-only-visit";
import { AdminRequestsList } from "../../../../components/admin-requests-list";
import { AdminRequestFilters } from "../../../../components/admin-request-filters";
import { getAdminOrganizations, getAdminRequestsIndex } from "../../../../lib/api";
import type { AdminRequestTab } from "../../../../lib/types";

const TABS: { key: AdminRequestTab; label: string }[] = [
  // label = key under admin.requests
  { key: "active", label: "tabLive" },
  { key: "assigned", label: "tabAssigned" },
  { key: "all", label: "tabAll" },
];

function normalizeTab(value: string | string[] | undefined): AdminRequestTab {
  const raw = Array.isArray(value) ? value[0] : value;
  if (TABS.some((t) => t.key === raw)) return raw as AdminRequestTab;
  return "active";
}

function singleString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function hrefFor(tab: AdminRequestTab, siteId: string | undefined): string {
  const params = new URLSearchParams();
  if (tab !== "active") params.set("tab", tab);
  if (siteId) params.set("site_id", siteId);
  const qs = params.toString();
  return `/admin/requests${qs ? `?${qs}` : ""}`;
}

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("admin.requests");
  const tAdmin = await getTranslations("admin");
  const params = await searchParams;
  const tab = normalizeTab(params.tab);
  const siteId = singleString(params.site_id);
  const urgency = singleString(params.urgency) ?? "all";
  const language = singleString(params.language) ?? "all";

  const [data, sites] = await Promise.all([
    getAdminRequestsIndex({ tab, siteId, urgency, language }),
    getAdminOrganizations(),
  ]);
  const { items, counts, next_cursor } = data;
  const siteNames = Object.fromEntries(sites.map((s) => [s.id, s.name]));

  const urgentCount = items.filter((r) => r.urgent && r.status !== "assigned").length;
  const headline =
    tab === "active" && counts.active > 0
      ? t("headlineActive", { count: counts.active })
      : tab === "assigned"
        ? t("headlineAssigned")
        : t("headlineAll");

  return (
    <div>
      <PollingRefresh everyMs={60_000} />
      <header style={{ marginBottom: 22 }}>
        <Eyebrow style={{ marginBottom: 6 }}>{t("eyebrow")}</Eyebrow>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: "clamp(2rem, 4vw, 2.9rem)", lineHeight: 1.05, fontWeight: 500, color: "var(--ink)" }}>
              {headline.split(" ")[0]} <em style={{ fontStyle: "italic" }}>{headline.split(" ").slice(1).join(" ")}</em>
            </h1>
            <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--ink-2)" }}>
              {urgentCount > 0 ? t("urgentUnassigned", { count: urgentCount }) : ""}{t("sorted")}
            </p>
          </div>
          <HideOnReadOnlyVisit>
            <Link
              href="/admin/requests/new"
              style={{ padding: "10px 18px", borderRadius: 999, background: "var(--ink)", color: "var(--paper)", fontSize: 14, fontWeight: 500, textDecoration: "none", whiteSpace: "nowrap" }}
            >
              {tAdmin("dashboard.newRequest")}
            </Link>
          </HideOnReadOnlyVisit>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {TABS.map((tabDef) => {
          const active = tab === tabDef.key;
          return (
            <Link
              key={tabDef.key}
              href={hrefFor(tabDef.key, siteId)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                borderRadius: 999,
                background: active ? "var(--ink)" : "var(--card)",
                color: active ? "var(--paper)" : "var(--ink)",
                border: `0.5px solid ${active ? "var(--ink)" : "var(--line)"}`,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              {t(tabDef.label)}
              <Mono style={{ fontSize: 11, opacity: 0.7 }}>{counts[tabDef.key]}</Mono>
            </Link>
          );
        })}
      </div>

      {/* Site pills + more filter */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", marginBottom: 22, paddingBottom: 16, borderBottom: "0.5px solid var(--line)" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {sites.length > 1 && (
            <>
              <SitePill href={hrefFor(tab, undefined)} active={!siteId} label={tAdmin("shell.allSites")} />
              {sites.map((s) => (
                <SitePill key={s.id} href={hrefFor(tab, s.id)} active={siteId === s.id} label={s.name} />
              ))}
            </>
          )}
        </div>
        <AdminRequestFilters tab={tab} siteId={siteId} urgency={urgency} language={language} />
      </div>

      <AdminRequestsList
        key={`${tab}:${siteId ?? ""}:${urgency}:${language}`}
        tab={tab}
        initialRows={items}
        initialCursor={next_cursor}
        siteNames={siteNames}
        siteId={siteId}
        urgency={urgency}
        language={language}
      />
    </div>
  );
}

function SitePill({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      style={{
        padding: "5px 12px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 500,
        textDecoration: "none",
        background: active ? "var(--terra-soft)" : "transparent",
        color: active ? "var(--terra-ink)" : "var(--ink-2)",
        border: `0.5px solid ${active ? "var(--terra)" : "var(--line)"}`,
      }}
    >
      {label}
    </Link>
  );
}
