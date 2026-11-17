import { getTranslations } from "next-intl/server";
import { Link } from "../../../i18n/navigation";
import { TenantAccessRequestsCard } from "../../../components/tenant-access-requests-card";
import { Eyebrow, Mono } from "../../../components/ui";
import { getApfSnapshot, getTenantAccessGrants } from "../../../lib/api";

const STATUS_ORDER = [
  "draft", "open", "notified", "responses_received",
  "assigned", "completed", "cancelled", "expired",
];

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

const CARD_STYLE: React.CSSProperties = {
  background: "var(--card)",
  border: "0.5px solid var(--line)",
};

export default async function ApfHomePage() {
  const t = await getTranslations("apf.dashboard");
  const tAdmin = await getTranslations("admin");
  const statusLabel = (status: string) =>
    tAdmin.has(`status.${status}`) ? tAdmin(`status.${status}`) : status.replace(/_/g, " ");
  const orgTypeLabel = (type: string) =>
    tAdmin.has(`organizations.types.${type}`) ? tAdmin(`organizations.types.${type}`) : type;
  const [snapshot, accessGrants] = await Promise.all([
    getApfSnapshot(),
    getTenantAccessGrants(), // null-safe; renders nothing unless a request is pending/active
  ]);
  const { kpis, status_breakdown, shortage_cities, org_activity, recent_closed_requests } = snapshot;

  return (
    <>
      {accessGrants && <TenantAccessRequestsCard grants={accessGrants.grants} />}
      <section style={{ marginBottom: 32 }}>
        <Eyebrow style={{ marginBottom: 12 }}>{t("eyebrow")}</Eyebrow>
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
          {t("titleLead")} <em style={{ fontStyle: "italic" }}>{t("titleEm")}</em>.
        </h1>
        <p style={{ margin: "12px 0 0", maxWidth: 720, color: "var(--ink-2)", lineHeight: 1.55, fontSize: 15 }}>
          {t("description")}
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
          label={t("fillRate")}
          value={`${kpis.fill_rate}%`}
          accent="var(--moss)"
          sub={t("fillRateSub", { filled: kpis.filled_count, total: kpis.total_requests })}
        />
        <MetricCard
          label={t("avgFill")}
          value={kpis.avg_fill_hours != null ? t("avgFillValue", { hours: String(kpis.avg_fill_hours) }) : "—"}
          sub={t("avgFillSub")}
        />
        <MetricCard
          label={t("activeSubs")}
          value={kpis.active_substitutes}
          sub={t("activeSubsSub")}
        />
        <MetricCard
          label={t("unfilled")}
          value={kpis.unfilled_count}
          accent={kpis.unfilled_count > 0 ? "var(--rose)" : "var(--moss)"}
          sub={t("unfilledSub")}
        />
        <MetricCard label={t("total")} value={kpis.total_requests} sub={t("totalSub")} />
        <MetricCard label={t("orgs")} value={kpis.organizations_count} sub={t("orgsSub")} />
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 0.7fr)",
          gap: 16,
          marginBottom: 28,
        }}
      >
        <Panel title={t("breakdown")}>
          <div style={{ display: "grid", gap: 12 }}>
            {STATUS_ORDER.filter((s) => status_breakdown[s]).map((status) => {
              const count = status_breakdown[status] || 0;
              const pct = kpis.total_requests
                ? Math.round((count / kpis.total_requests) * 100)
                : 0;
              return (
                <div key={status} style={{ display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: "var(--ink)" }}>{statusLabel(status)}</span>
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
              <p style={{ margin: 0, color: "var(--ink-3)", fontSize: 13 }}>{t("noRequests")}</p>
            )}
          </div>
        </Panel>

        <Panel title={t("shortage")} subtitle={t("flagged", { count: shortage_cities.length })}>
          {shortage_cities.length === 0 ? (
            <p style={{ margin: 0, color: "var(--ink-3)", fontSize: 13 }}>
              {t("noShortage")}
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
                    {t("noSubstitute")}
                  </span>
                </div>
              ))}
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-3)" }}>
                {t("shortageNote")}
              </p>
            </div>
          )}
        </Panel>
      </section>

      <section style={{ marginBottom: 28 }}>
        <Panel title={t("orgActivity")} subtitle={t("orgsShort", { count: kpis.organizations_count })}>
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
                    {orgTypeLabel(row.type)}
                  </div>
                </div>
                <Stat label={t("statTotal")} value={row.total} />
                <Stat label={t("statFilled")} value={row.filled} accent="var(--moss)" />
                <Stat
                  label={t("statOpen")}
                  value={row.open}
                  accent={row.open > 0 ? "var(--rose)" : undefined}
                />
              </Link>
            ))}
            {org_activity.length === 0 && (
              <p style={{ margin: 0, color: "var(--ink-3)" }}>{t("noOrgs")}</p>
            )}
          </div>
        </Panel>
      </section>

      {recent_closed_requests.length > 0 && (
        <section>
          <Panel title={t("recentClosed")} subtitle={t("last8")}>
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
                        {r.organization_name ?? t("unknownOrg")} · {r.city} · {r.work_date}
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
                      {statusLabel(r.status)}
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
