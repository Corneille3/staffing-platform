import Link from "next/link";
import { getAssignments, getWorkers } from "../../../lib/api";
import { Assignment, Worker } from "../../../lib/types";
import { RemoveUserButton } from "../../../components/remove-user-button";

const LANG_LABEL: Record<string, string> = { fr: "FR", en: "EN", bilingual: "Bilingual" };

function utilizationLabel(count: number): { text: string; color: string } {
  if (count === 0) return { text: "No assignments", color: "rgba(247,240,223,0.35)" };
  if (count === 1) return { text: "1 assignment", color: "#88b8d4" };
  return { text: `${count} assignments`, color: "#a4c8a3" };
}

function activeLabel(worker: Worker, assignments: Assignment[]): { count: number; active: number } {
  const all = assignments.filter((a) => a.worker_user_id === worker.id);
  const active = all.filter((a) => ["pending_confirmation", "confirmed"].includes(a.status)).length;
  return { count: all.length, active };
}

export default async function SubstitutePoolPage() {
  const [workers, assignments] = await Promise.all([getWorkers(), getAssignments()]);

  const enriched = workers
    .map((w) => ({ worker: w, ...activeLabel(w, assignments) }))
    .sort((a, b) => {
      // Available first, then by assignment count desc
      const aAvail = a.worker.profile?.availability_status === "available" ? 0 : 1;
      const bAvail = b.worker.profile?.availability_status === "available" ? 0 : 1;
      if (aAvail !== bAvail) return aAvail - bAvail;
      return b.count - a.count;
    });

  const availableCount = enriched.filter(
    (e) => e.worker.profile?.availability_status === "available",
  ).length;
  const unavailableCount = enriched.length - availableCount;
  const withProfile = enriched.filter((e) => e.worker.profile !== null).length;

  return (
    <main style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 20px 80px" }}>
      {/* Header */}
      <section style={{ marginBottom: 36 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.24em", textTransform: "uppercase", opacity: 0.6 }}>
          Substitute Pool
        </p>
        <h1 style={{ margin: "10px 0 8px", fontSize: "clamp(2rem, 4vw, 3.4rem)", lineHeight: 1.05 }}>
          Network substitute pool.
        </h1>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <p style={{ margin: 0, maxWidth: 640, opacity: 0.72, lineHeight: 1.55 }}>
            Every substitute registered across the Staffig network — availability status, coverage cities,
            qualifications, and assignment utilization at a glance.
          </p>
          <Link
            href="/apf/workers/new"
            style={{
              display: "inline-block",
              padding: "10px 20px",
              borderRadius: 12,
              background: "#f7f0df",
              color: "#183229",
              fontSize: 14,
              fontWeight: 800,
              textDecoration: "none",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            + Add substitute
          </Link>
        </div>
      </section>

      {/* Summary bar */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 28,
        }}
      >
        <SummaryCard label="Total substitutes" value={enriched.length} />
        <SummaryCard label="Available now" value={availableCount} accent="#a4c8a3" />
        <SummaryCard label="Unavailable" value={unavailableCount} accent={unavailableCount > 0 ? "#d6a08c" : undefined} />
        <SummaryCard label="With profile" value={withProfile} />
      </section>

      {/* Table */}
      <div
        style={{
          padding: 24,
          borderRadius: 22,
          background: "rgba(247, 240, 223, 0.06)",
          border: "1px solid rgba(247, 240, 223, 0.1)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>All substitutes</h2>
          <span style={{ fontSize: 13, opacity: 0.55 }}>{enriched.length} records</span>
        </div>

        {/* Column headers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.6fr 0.7fr 1.2fr 1.6fr 1.6fr 0.9fr 0.7fr",
            gap: 12,
            padding: "8px 14px",
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            opacity: 0.5,
          }}
        >
          <span>Name</span>
          <span>Lang</span>
          <span>Status</span>
          <span>Cities</span>
          <span>Qualifications</span>
          <span>Utilization</span>
          <span></span>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          {enriched.map(({ worker, count, active }) => {
            const profile = worker.profile;
            const available = profile?.availability_status === "available";
            const util = utilizationLabel(count);
            return (
              <div
                key={worker.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.6fr 0.7fr 1.2fr 1.6fr 1.6fr 0.9fr 0.7fr",
                  gap: 12,
                  padding: "14px 14px",
                  borderRadius: 14,
                  background: "rgba(247, 240, 223, 0.03)",
                  alignItems: "center",
                  border: "1px solid rgba(247, 240, 223, 0.06)",
                }}
              >
                {/* Name */}
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {worker.first_name} {worker.last_name}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.5, marginTop: 2 }}>{worker.email}</div>
                </div>

                {/* Language */}
                <span
                  style={{
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: "rgba(247,240,223,0.1)",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    width: "fit-content",
                  }}
                >
                  {LANG_LABEL[worker.preferred_language] ?? worker.preferred_language.toUpperCase()}
                </span>

                {/* Availability */}
                <span
                  style={{
                    padding: "3px 10px",
                    borderRadius: 999,
                    background: available ? "rgba(164,200,163,0.15)" : "rgba(214,160,140,0.15)",
                    color: available ? "#a4c8a3" : "#d6a08c",
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    width: "fit-content",
                  }}
                >
                  {available ? "Available" : "Unavailable"}
                </span>

                {/* Cities */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {profile?.supported_cities?.length ? (
                    profile.supported_cities.map((city) => (
                      <span
                        key={city}
                        style={{
                          padding: "2px 7px",
                          borderRadius: 999,
                          background: "rgba(136,184,212,0.15)",
                          color: "#88b8d4",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {city}
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: 12, opacity: 0.4 }}>—</span>
                  )}
                </div>

                {/* Qualifications + certifications */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {[...(profile?.qualifications ?? []), ...(profile?.certifications ?? [])].length ? (
                    [...(profile?.qualifications ?? []), ...(profile?.certifications ?? [])].map((q) => (
                      <span
                        key={q}
                        style={{
                          padding: "2px 7px",
                          borderRadius: 999,
                          background: "rgba(247,240,223,0.08)",
                          fontSize: 11,
                          opacity: 0.7,
                        }}
                      >
                        {q}
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: 12, opacity: 0.4 }}>—</span>
                  )}
                </div>

                {/* Utilization */}
                <div>
                  <div style={{ fontSize: 13, color: util.color, fontWeight: 600 }}>{util.text}</div>
                  {active > 0 && (
                    <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{active} active</div>
                  )}
                </div>

                {/* Remove */}
                <div style={{ justifySelf: "end" }}>
                  <RemoveUserButton
                    userId={worker.id}
                    userName={`${worker.first_name} ${worker.last_name}`}
                    isActive={worker.is_active}
                  />
                </div>
              </div>
            );
          })}

          {enriched.length === 0 && (
            <p style={{ margin: "12px 0 0", opacity: 0.5 }}>No substitutes registered yet.</p>
          )}
        </div>
      </div>

      <p style={{ marginTop: 32, opacity: 0.45, fontSize: 13 }}>
        Staffig oversight surface · read-only · D3 Activity History coming next.
      </p>
    </main>
  );
}

function SummaryCard({
  label, value, accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div
      style={{
        padding: "18px 20px",
        borderRadius: 18,
        background: "rgba(247, 240, 223, 0.06)",
        border: "1px solid rgba(247, 240, 223, 0.12)",
      }}
    >
      <p style={{ margin: 0, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", opacity: 0.55 }}>
        {label}
      </p>
      <p style={{ margin: "8px 0 0", fontSize: 32, fontWeight: 700, color: accent || "#f3ead4", lineHeight: 1 }}>
        {value}
      </p>
    </div>
  );
}
