import { Link } from "../../../../i18n/navigation";
import { Eyebrow, Mono } from "../../../../components/ui";
import { ReplacementPolicyCard } from "../../../../components/replacement-policy-card";
import { getOrganizations, getReplacementFeed } from "../../../../lib/api";
import type { ReplacementFeedItem } from "../../../../lib/types";

const STATUS_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  searching: { label: "En recherche", bg: "var(--terra-soft)", color: "var(--terra-ink)" },
  filled: { label: "Comblé", bg: "var(--moss-soft)", color: "var(--moss)" },
  unfilled: { label: "Non comblé", bg: "var(--rose-soft)", color: "var(--rose)" },
  cancelled: { label: "Annulé", bg: "var(--paper-2)", color: "var(--ink-3)" },
};

function fmtTtf(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

function fmtDate(value: string): string {
  try {
    return new Date(value).toLocaleDateString("fr-CA", { month: "short", day: "numeric" });
  } catch {
    return value;
  }
}

export default async function AdminReplacementsPage() {
  const [feed, organizations] = await Promise.all([
    getReplacementFeed(),
    getOrganizations().catch(() => []),
  ]);
  const primaryOrg = organizations[0];

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1100 }}>
      <Eyebrow>Suppléance en libre-service</Eyebrow>
      <h1 style={{ fontFamily: "var(--serif)", fontSize: "clamp(1.8rem, 3.5vw, 2.4rem)", lineHeight: 1.04, margin: "6px 0 0" }}>
        Quarts <em style={{ fontStyle: "italic" }}>comblés par le bassin</em>
      </h1>
      <p style={{ margin: "8px 0 24px", color: "var(--ink-2)", fontSize: 14, maxWidth: 640 }}>
        Chaque quart libéré par un·e remplaçant·e ou signalé en absence par le personnel.
        Vous voyez tout — sans être le goulot d&apos;étranglement.
      </p>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 26 }}>
        <Kpi value={feed.kpis.released_this_week} label="Libérés (7 j)" />
        <Kpi value={feed.kpis.filled} label="Comblés par le bassin" />
        <Kpi value={fmtTtf(feed.kpis.avg_time_to_fill_minutes)} label="Délai moyen" />
        <Kpi value={feed.kpis.unfilled} label="Non comblés" tone={feed.kpis.unfilled > 0 ? "rose" : undefined} />
      </div>

      {/* Feed */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20, alignItems: "start" }}>
        <div style={{ border: "0.5px solid var(--line)", borderRadius: 16, overflow: "hidden", background: "var(--card)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr 1fr 1.2fr 0.8fr", padding: "11px 18px", borderBottom: "0.5px solid var(--line)", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 500 }}>
            <div>Personne</div><div>Quart</div><div>Statut</div><div>Pris par</div><div>Délai</div>
          </div>
          {feed.items.length === 0 ? (
            <div style={{ padding: "28px 18px", fontSize: 13, color: "var(--ink-3)" }}>
              Aucun quart libéré pour l&apos;instant.
            </div>
          ) : (
            feed.items.map((item, i) => <FeedRow key={item.request_id} item={item} last={i === feed.items.length - 1} />)
          )}
        </div>

        {primaryOrg ? (
          <ReplacementPolicyCard organizationId={primaryOrg.id} organizationName={primaryOrg.name} />
        ) : null}
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
            Absence
          </span>
        )}
      </div>
      <div style={{ color: "var(--ink-2)" }}>
        {item.title}
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
          {fmtDate(item.work_date)} · {item.start_time.slice(0, 5)}–{item.end_time.slice(0, 5)}
        </div>
      </div>
      <div>
        <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 99, background: s.bg, color: s.color, fontSize: 11, fontWeight: 600 }}>
          {s.label}
        </span>
      </div>
      <div style={{ color: item.claimer_name ? "var(--ink)" : "var(--ink-3)" }}>{item.claimer_name ?? "—"}</div>
      <Mono style={{ fontSize: 12, color: "var(--ink-2)" }}>{fmtTtf(item.time_to_fill_minutes)}</Mono>
    </Link>
  );
}
