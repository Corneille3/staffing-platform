import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { Link } from "../../../../i18n/navigation";
import { HideOnReadOnlyVisit } from "../../../../components/read-only-visit";
import { Eyebrow, Mono } from "../../../../components/ui";
import { ApfBulkInviteButton } from "../../../../components/apf-bulk-invite-button";
import { getApfNetworkPool, getAssignments, getWorkers } from "../../../../lib/api";
import { Assignment, ContributorRow, Worker } from "../../../../lib/types";
import { RemoveUserButton } from "../../../../components/remove-user-button";

const CARD_STYLE: React.CSSProperties = {
  background: "var(--card)",
  border: "0.5px solid var(--line)",
};

function coverageAccent(pct: number): string {
  if (pct >= 85) return "var(--moss)";
  if (pct >= 50) return "var(--sand)";
  return "var(--rose)";
}

function utilizationColor(count: number): string {
  if (count === 0) return "var(--ink-3)";
  if (count === 1) return "var(--sand)";
  return "var(--moss)";
}

function assignmentStats(worker: Worker, assignments: Assignment[]): { count: number; active: number } {
  const all = assignments.filter((a) => a.worker_user_id === worker.id);
  const active = all.filter((a) => ["pending_confirmation", "confirmed"].includes(a.status)).length;
  return { count: all.length, active };
}

export default async function SubstitutePoolPage() {
  const [pool, workers, assignments] = await Promise.all([
    getApfNetworkPool(),
    getWorkers(),
    getAssignments(),
  ]);
  const { kpis, distribution, top_contributors } = pool;
  const t = await getTranslations("apf.pool");
  const tl = await getTranslations("apf.lists");
  const tAdmin = await getTranslations("admin");
  const tCred = await getTranslations("worker.credentials");
  const mono = (chunks: React.ReactNode) => <Mono>{chunks}</Mono>;

  const enriched = workers
    .map((w) => ({ worker: w, ...assignmentStats(w, assignments) }))
    .sort((a, b) => {
      const aActive = a.worker.is_active ? 0 : 1;
      const bActive = b.worker.is_active ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      const aAvail = a.worker.profile?.availability_status === "available" ? 0 : 1;
      const bAvail = b.worker.profile?.availability_status === "available" ? 0 : 1;
      if (aAvail !== bAvail) return aAvail - bAvail;
      return b.count - a.count;
    });

  return (
    <>
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
          {t.rich("headline", {
            count: kpis.total,
            em: (chunks) => <em style={{ fontStyle: "italic" }}>{chunks}</em>,
          })}
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
          <p style={{ margin: 0, maxWidth: 640, color: "var(--ink-2)", lineHeight: 1.55, fontSize: 15 }}>
            {t("description")}
          </p>
          <HideOnReadOnlyVisit>
          <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
            <Link
              href="/apf/workers/new"
              style={{
                display: "inline-block",
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
              {t("addOne")}
            </Link>
            <ApfBulkInviteButton />
          </div>
          </HideOnReadOnlyVisit>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
          gap: 16,
          marginBottom: 28,
        }}
      >
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
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500, color: "var(--ink)" }}>
              {t("distribution")}
            </h2>
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
              {t.rich("cities", { count: distribution.length, m: mono })}
            </span>
          </div>
          {distribution.length === 0 ? (
            <p style={{ margin: 0, color: "var(--ink-3)", fontSize: 13 }}>
              {t("noCities")}
            </p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {distribution.map((row) => {
                const accent = coverageAccent(row.coverage_pct);
                return (
                  <div key={row.city} style={{ display: "grid", gap: 6 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        fontSize: 13,
                      }}
                    >
                      <span style={{ color: "var(--ink)" }}>{row.city}</span>
                      <span style={{ color: "var(--ink-3)" }}>
                        <Mono>
                          {row.available}/{row.total}
                        </Mono>
                        <span style={{ marginLeft: 8, color: accent, fontWeight: 500 }}>
                          <Mono>{row.coverage_pct}%</Mono>
                        </span>
                      </span>
                    </div>
                    <div
                      style={{
                        height: 8,
                        borderRadius: 99,
                        background: "var(--line-soft)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${row.coverage_pct}%`,
                          background: accent,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <BentoCard label={t("total")} value={kpis.total} />
          <BentoCard label={t("availableNow")} value={kpis.available_now} accent="var(--moss)" />
          <BentoCard label={t("multiOrg")} value={`${kpis.multi_org_pct}%`} />
          <BentoCard label={t("avgReliability")} value={`${kpis.avg_reliability}/100`} />
          {kpis.shortage_cities_count > 0 && (
            <div
              style={{
                gridColumn: "1 / -1",
                padding: "12px 14px",
                borderRadius: "var(--r-md)",
                background: "var(--sand-soft)",
                border: "0.5px solid var(--sand)",
                fontSize: 13,
                color: "var(--ink)",
              }}
            >
              {t.rich("risk", {
                count: kpis.shortage_cities_count,
                b: (chunks) => <strong style={{ fontWeight: 500 }}>{chunks}</strong>,
              })}
            </div>
          )}
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
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
              marginBottom: 6,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500, color: "var(--ink)" }}>
              {t("top")}
            </h2>
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
              {t.rich("shown", {
                shown: Math.min(top_contributors.length, 7),
                total: top_contributors.length,
                m: mono,
              })}
            </span>
          </div>
          <p style={{ margin: "0 0 16px", color: "var(--ink-3)", fontSize: 12 }}>
            {t("sortedBy")}
          </p>

          <ContributorsTable rows={top_contributors.slice(0, 7)} />
        </div>
      </section>

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
            marginBottom: 20,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500, color: "var(--ink)" }}>
            {t("all")}
          </h2>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {tl.rich("records", { count: enriched.length, m: mono })}
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.6fr 0.7fr 1.2fr 1.6fr 1.6fr 0.9fr 0.7fr",
            gap: 12,
            padding: "8px 14px",
            fontSize: 10,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            fontWeight: 500,
            borderBottom: "0.5px solid var(--line)",
          }}
        >
          <span>{tl("colName")}</span>
          <span>{tl("colLang")}</span>
          <span>{tl("colStatus")}</span>
          <span>{t("colCities")}</span>
          <span>{t("colQualifications")}</span>
          <span>{t("colUtilization")}</span>
          <span></span>
        </div>

        <div style={{ display: "grid" }}>
          {enriched.map(({ worker, count, active }) => {
            const profile = worker.profile;
            const available = profile?.availability_status === "available";
            return (
              <div
                key={worker.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.6fr 0.7fr 1.2fr 1.6fr 1.6fr 0.9fr 0.7fr",
                  gap: 12,
                  padding: "14px",
                  borderBottom: "0.5px solid var(--line-soft)",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14, color: "var(--ink)" }}>
                    {worker.first_name} {worker.last_name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{worker.email}</div>
                </div>

                <span
                  style={{
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: "var(--paper)",
                    border: "0.5px solid var(--line)",
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--ink)",
                    width: "fit-content",
                  }}
                >
                  {tAdmin.has(`languages.${worker.preferred_language}`) ? tAdmin(`languages.${worker.preferred_language}`) : worker.preferred_language.toUpperCase()}
                </span>

                {worker.is_active ? (
                  <StatusBadge
                    label={available ? t("available") : t("unavailable")}
                    accent={available ? "var(--moss)" : "var(--rose)"}
                  />
                ) : (
                  <StatusBadge label={t("removed")} accent="var(--rose)" />
                )}

                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {profile?.supported_cities?.length ? (
                    profile.supported_cities.map((city) => (
                      <span
                        key={city}
                        style={{
                          padding: "2px 7px",
                          borderRadius: 999,
                          background: "var(--paper)",
                          color: "var(--ink)",
                          fontSize: 11,
                          fontWeight: 500,
                          border: "0.5px solid var(--line)",
                        }}
                      >
                        {city}
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--ink-3)" }}>—</span>
                  )}
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {[...(profile?.qualifications ?? []), ...(profile?.certifications ?? [])].length ? (
                    [...(profile?.qualifications ?? []), ...(profile?.certifications ?? [])].map((q) => (
                      <span
                        key={q}
                        style={{
                          padding: "2px 7px",
                          borderRadius: 999,
                          background: "var(--line-soft)",
                          color: "var(--ink-2)",
                          fontSize: 11,
                        }}
                      >
                        {tCred.has(q) ? tCred(q) : q}
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--ink-3)" }}>—</span>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: 13, color: utilizationColor(count), fontWeight: 500 }}>{t("assignments", { count })}</div>
                  {active > 0 && (
                    <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                      {t.rich("activeCount", { count: active, m: mono })}
                    </div>
                  )}
                </div>

                <div style={{ justifySelf: "end" }}>
                  <HideOnReadOnlyVisit>
                    <RemoveUserButton
                      userId={worker.id}
                      userName={`${worker.first_name} ${worker.last_name}`}
                      isActive={worker.is_active}
                    />
                  </HideOnReadOnlyVisit>
                </div>
              </div>
            );
          })}

          {enriched.length === 0 && (
            <p style={{ margin: "12px 0 0", color: "var(--ink-3)" }}>{t("empty")}</p>
          )}
        </div>
      </div>
    </>
  );
}

function ContributorsTable({ rows }: { rows: ContributorRow[] }) {
  const t = useTranslations("apf.pool");
  const tl = useTranslations("apf.lists");
  const tAdmin = useTranslations("admin");
  if (rows.length === 0) {
    return (
      <p style={{ margin: 0, color: "var(--ink-3)", fontSize: 13 }}>
        {t("noContributors")}
      </p>
    );
  }
  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.8fr 1.2fr 0.7fr 0.7fr 1.2fr 1fr",
          gap: 12,
          padding: "8px 14px",
          fontSize: 10,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
          fontWeight: 500,
          borderBottom: "0.5px solid var(--line)",
        }}
      >
        <span>{tl("colName")}</span>
        <span>{tl("colCity")}</span>
        <span>{t("colOrgCount")}</span>
        <span>{t("colShifts")}</span>
        <span>{t("colLangs")}</span>
        <span>{t("colReliability")}</span>
      </div>
      <div style={{ display: "grid" }}>
        {rows.map((r) => (
          <div
            key={r.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1.8fr 1.2fr 0.7fr 0.7fr 1.2fr 1fr",
              gap: 12,
              padding: "12px 14px",
              borderBottom: "0.5px solid var(--line-soft)",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 14, color: "var(--ink)" }}>
              {r.first_name} {r.last_name}
            </span>
            <span style={{ fontSize: 13, color: "var(--ink-2)" }}>
              {r.cities.length ? r.cities[0] : "—"}
            </span>
            <span style={{ fontSize: 13, color: "var(--ink-2)" }}>
              <Mono>{r.org_count}</Mono>
            </span>
            <span style={{ fontSize: 13, color: "var(--ink-2)", fontWeight: 500 }}>
              <Mono>{r.shifts_30d}</Mono>
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              {r.languages.map((lang) => (
                <span
                  key={lang}
                  style={{
                    padding: "1px 6px",
                    borderRadius: 999,
                    background: "var(--paper)",
                    border: "0.5px solid var(--line)",
                    fontSize: 10,
                    fontFamily: "var(--mono)",
                    color: "var(--ink)",
                    letterSpacing: ".04em",
                    textTransform: "uppercase",
                  }}
                >
                  {tAdmin.has(`languages.${lang}`) ? tAdmin(`languages.${lang}`) : lang.toUpperCase()}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  flex: 1,
                  height: 6,
                  borderRadius: 99,
                  background: "var(--line-soft)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${r.reliability}%`,
                    background: coverageAccent(r.reliability),
                  }}
                />
              </div>
              <span style={{ fontSize: 12, color: "var(--ink-3)", minWidth: 28, textAlign: "right" }}>
                <Mono>{r.reliability}</Mono>
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function StatusBadge({ label, accent }: { label: string; accent: string }) {
  return (
    <span
      style={{
        padding: "3px 10px",
        borderRadius: 999,
        background: "var(--paper)",
        color: accent,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        width: "fit-content",
        border: `0.5px solid ${accent}`,
      }}
    >
      {label}
    </span>
  );
}

function BentoCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div
      style={{
        ...CARD_STYLE,
        padding: "18px 20px",
        borderRadius: "var(--r-md)",
      }}
    >
      <Eyebrow>{label}</Eyebrow>
      <p
        style={{
          margin: "10px 0 0",
          fontFamily: "var(--serif)",
          fontSize: 30,
          fontWeight: 400,
          color: accent || "var(--ink)",
          lineHeight: 1,
        }}
      >
        {value}
      </p>
    </div>
  );
}
