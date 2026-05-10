import Link from "next/link";
import { getCoordinators } from "../../../lib/api";
import { RemoveUserButton } from "../../../components/remove-user-button";

const LANG_LABEL: Record<string, string> = { fr: "FR", en: "EN", bilingual: "Bilingual" };

export default async function CoordinatorsPage() {
  const coordinators = await getCoordinators();

  return (
    <main style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 20px 80px" }}>
      <section style={{ marginBottom: 36 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.24em", textTransform: "uppercase", opacity: 0.6 }}>
          Network Management
        </p>
        <h1 style={{ margin: "10px 0 8px", fontSize: "clamp(2rem, 4vw, 3.4rem)", lineHeight: 1.05 }}>
          Coordinators
        </h1>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <p style={{ margin: 0, maxWidth: 640, opacity: 0.72, lineHeight: 1.55 }}>
            Coordinators manage coverage requests for their assigned organizations. A coordinator can be assigned to multiple organizations.
          </p>
          <Link
            href="/apf/coordinators/new"
            style={{
              display: "inline-block", padding: "10px 20px", borderRadius: 12,
              background: "#f7f0df", color: "#183229", fontSize: 14, fontWeight: 800,
              textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
            }}
          >
            + Invite coordinator
          </Link>
        </div>
      </section>

      <div style={{ padding: 24, borderRadius: 22, background: "rgba(247,240,223,0.06)", border: "1px solid rgba(247,240,223,0.1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>All coordinators</h2>
          <span style={{ fontSize: 13, opacity: 0.55 }}>{coordinators.length} records</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.8fr 0.6fr 2.4fr 0.8fr 0.7fr", gap: 12, padding: "8px 14px", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.5 }}>
          <span>Name</span>
          <span>Lang</span>
          <span>Assigned organizations</span>
          <span>Status</span>
          <span></span>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          {coordinators.map((coord) => (
            <div
              key={coord.id}
              style={{
                display: "grid", gridTemplateColumns: "1.8fr 0.6fr 2.4fr 0.8fr 0.7fr", gap: 12,
                padding: "14px", borderRadius: 14, alignItems: "center",
                background: "rgba(247,240,223,0.03)", border: "1px solid rgba(247,240,223,0.06)",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {coord.first_name} {coord.last_name}
                </div>
                <div style={{ fontSize: 12, opacity: 0.5, marginTop: 2 }}>{coord.email}</div>
              </div>

              <span style={{ padding: "3px 8px", borderRadius: 999, background: "rgba(247,240,223,0.1)", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", width: "fit-content" }}>
                {LANG_LABEL[coord.preferred_language] ?? coord.preferred_language.toUpperCase()}
              </span>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {coord.organizations.length > 0 ? (
                  coord.organizations.map((org) => (
                    <span
                      key={org.id}
                      style={{ padding: "3px 10px", borderRadius: 999, background: "rgba(136,184,212,0.15)", color: "#88b8d4", fontSize: 12, fontWeight: 600 }}
                    >
                      {org.name}
                    </span>
                  ))
                ) : (
                  <span style={{ fontSize: 12, opacity: 0.4 }}>No organizations assigned</span>
                )}
              </div>

              <span style={{
                fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
                padding: "3px 10px", borderRadius: 999, width: "fit-content",
                background: coord.is_active ? "rgba(164,200,163,0.15)" : "rgba(214,160,140,0.15)",
                color: coord.is_active ? "#a4c8a3" : "#d6a08c",
              }}>
                {coord.is_active ? "Active" : "Inactive"}
              </span>

              <div style={{ justifySelf: "end" }}>
                <RemoveUserButton
                  userId={coord.id}
                  userName={`${coord.first_name} ${coord.last_name}`}
                  isActive={coord.is_active}
                />
              </div>
            </div>
          ))}

          {coordinators.length === 0 && (
            <p style={{ margin: "12px 0 0", opacity: 0.5 }}>No coordinators yet. Invite the first one.</p>
          )}
        </div>
      </div>
    </main>
  );
}
