import { useLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Link } from "../../../../i18n/navigation";
import { Eyebrow, Mono } from "../../../../components/ui";
import { ReplacementPolicyPanel } from "../../../../components/replacement-policy-panel";
import { getOrganizations, getReplacementFeed } from "../../../../lib/api";
import type { ReplacementFeedItem } from "../../../../lib/types";

// label = key under admin.replacements.status
const STATUS_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  searching: { label: "searching", bg: "var(--terra-soft)", color: "var(--terra-ink)" },
  filled: { label: "filled", bg: "var(--moss-soft)", color: "var(--moss)" },
  unfilled: { label: "unfilled", bg: "var(--rose-soft)", color: "var(--rose)" },
  cancelled: { label: "cancelled", bg: "var(--paper-2)", color: "var(--ink-3)" },
};

function fmtTtf(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

function fmtDate(value: string, locale: string): string {
  try {
    // The value is a plain date — pin to UTC so it doesn't render as the
    // previous day on a server or browser west of Greenwich.
    return new Date(value).toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
  } catch {
    return value;
  }
}

export default async function AdminReplacementsPage() {
  const t = await getTranslations("admin.replacements");
  const [feed, organizations] = await Promise.all([
    getReplacementFeed(),
    getOrganizations().catch(() => []),
  ]);

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1100 }}>
      <Eyebrow>{t("eyebrow")}</Eyebrow>
      <h1 style={{ fontFamily: "var(--serif)", fontSize: "clamp(1.8rem, 3.5vw, 2.4rem)", lineHeight: 1.04, margin: "6px 0 0" }}>
        {t("titleLead")} <em style={{ fontStyle: "italic" }}>{t("titleEm")}</em>
      </h1>
      <p style={{ margin: "8px 0 24px", color: "var(--ink-2)", fontSize: 14, maxWidth: 640 }}>
        {t("description")}
      </p>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 26 }}>
        <Kpi value={feed.kpis.released_this_week} label={t("kpiReleased")} />
        <Kpi value={feed.kpis.filled} label={t("kpiFilled")} />
        <Kpi value={fmtTtf(feed.kpis.avg_time_to_fill_minutes)} label={t("kpiAvg")} />
        <Kpi value={feed.kpis.unfilled} label={t("kpiUnfilled")} tone={feed.kpis.unfilled > 0 ? "rose" : undefined} />
      </div>

      {/* Feed */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20, alignItems: "start" }}>
        <div style={{ border: "0.5px solid var(--line)", borderRadius: 16, overflow: "hidden", background: "var(--card)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr 1fr 1.2fr 0.8fr", padding: "11px 18px", borderBottom: "0.5px solid var(--line)", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 500 }}>
            <div>{t("colPerson")}</div><div>{t("colShift")}</div><div>{t("colStatus")}</div><div>{t("colTakenBy")}</div><div>{t("colTime")}</div>
          </div>
          {feed.items.length === 0 ? (
            <div style={{ padding: "28px 18px", fontSize: 13, color: "var(--ink-3)" }}>
              {t("empty")}
            </div>
          ) : (
            feed.items.map((item, i) => <FeedRow key={item.request_id} item={item} last={i === feed.items.length - 1} />)
          )}
        </div>

        <ReplacementPolicyPanel
          organizations={organizations.map((o) => ({ id: o.id, name: o.name }))}
        />
      </div>
    </div>
  );
}

function Kpi({ value, label, tone }: { value: number | string; label: string; tone?: "rose" }) {
  return (
    <div style={{ background: "var(--card)", border: "0.5px solid var(--line)", borderRadius: 14, padding: "16px 18px" }}>
      <Mono style={{ fontSize: 26, fontWeight: 600, color: tone === "rose" ? "var(--rose)" : "var(--ink)" }}>
        {value}
      </Mono>
      <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4 }}>{label}</div>
    </div>
  );
}

function FeedRow({ item, last }: { item: ReplacementFeedItem; last: boolean }) {
  const t = useTranslations("admin.replacements");
  const locale = useLocale();
  const s = STATUS_STYLE[item.status] ?? STATUS_STYLE.searching;
  // Row links to the request detail — where the coordinator reviews responses
  // and assigns (managed mode) or just sees the audit (auto mode).
  return (
    <Link
      href={`/admin/requests/${item.request_id}`}
      style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr 1fr 1.2fr 0.8fr", padding: "13px 18px", borderTop: last ? undefined : "0.5px solid var(--line-soft)", alignItems: "center", fontSize: 13, textDecoration: "none", color: "inherit" }}
    >
      <div style={{ fontWeight: 500 }}>
        {item.giver_name}
        {/* Tag the permanent-staff path; releases stay unmarked (the default). */}
        {item.origin === "staff_absence" && (
          <span style={{ display: "inline-block", marginLeft: 7, padding: "2px 8px", borderRadius: 99, border: "0.5px solid var(--line)", background: "var(--sand-soft)", color: "var(--ink-2)", fontSize: 10.5, fontWeight: 600, verticalAlign: "middle" }}>
            {t("absence")}
          </span>
        )}
      </div>
      <div style={{ color: "var(--ink-2)" }}>
        {item.title}
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
          {fmtDate(item.work_date, locale)} · {item.start_time.slice(0, 5)}–{item.end_time.slice(0, 5)}
        </div>
      </div>
      <div>
        <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 99, background: s.bg, color: s.color, fontSize: 11, fontWeight: 600 }}>
          {t(`status.${s.label}`)}
        </span>
      </div>
      <div style={{ color: item.claimer_name ? "var(--ink)" : "var(--ink-3)" }}>{item.claimer_name ?? "—"}</div>
      <Mono style={{ fontSize: 12, color: "var(--ink-2)" }}>{fmtTtf(item.time_to_fill_minutes)}</Mono>
    </Link>
  );
}
