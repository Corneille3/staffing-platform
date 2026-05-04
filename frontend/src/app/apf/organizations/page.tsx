import Link from "next/link";
import { getOrganizations } from "../../../lib/api";

const ORG_TYPE_LABEL: Record<string, string> = {
  childcare: "Childcare",
  long_term_care: "Long-term Care",
  community_care: "Community Care",
  home_care: "Home Care",
  assisted_living: "Assisted Living",
  other: "Other",
};

export default async function OrganizationsPage() {
  const organizations = await getOrganizations();

  return (
    <main style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 20px 80px" }}>
      <section style={{ marginBottom: 36 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.24em", textTransform: "uppercase", opacity: 0.6 }}>
          Network Management
        </p>
        <h1 style={{ margin: "10px 0 8px", fontSize: "clamp(2rem, 4vw, 3.4rem)", lineHeight: 1.05 }}>
          Organizations
        </h1>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <p style={{ margin: 0, maxWidth: 640, opacity: 0.72, lineHeight: 1.55 }}>
            Member organizations registered under this network. Each organization can have one or more coordinators.
          </p>
          <Link
            href="/apf/organizations/new"
            style={{
              display: "inline-block", padding: "10px 20px", borderRadius: 12,
              background: "#f7f0df", color: "#183229", fontSize: 14, fontWeight: 800,
              textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
            }}
          >
            + New organization
          </Link>
        </div>
      </section>

      <div style={{ padding: 24, borderRadius: 22, background: "rgba(247,240,223,0.06)", border: "1px solid rgba(247,240,223,0.1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>All organizations</h2>
          <span style={{ fontSize: 13, opacity: 0.55 }}>{organizations.length} records</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr 1fr 0.8fr", gap: 12, padding: "8px 14px", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.5 }}>
          <span>Name</span>
          <span>Type</span>
          <span>City</span>
          <span>Language</span>
          <span>Status</span>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          {organizations.map((org) => (
            <div
              key={org.id}
              style={{
                display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr 1fr 0.8fr", gap: 12,
                padding: "14px", borderRadius: 14, alignItems: "center",
                background: "rgba(247,240,223,0.03)", border: "1px solid rgba(247,240,223,0.06)",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{org.name}</div>
                {org.contact_email && (
                  <div style={{ fontSize: 12, opacity: 0.5, marginTop: 2 }}>{org.contact_email}</div>
                )}
              </div>
              <span style={{ fontSize: 13, opacity: 0.8 }}>
                {ORG_TYPE_LABEL[org.type] ?? org.type}
              </span>
              <span style={{ fontSize: 13, opacity: 0.8 }}>{org.city}</span>
              <span style={{ fontSize: 12, padding: "3px 8px", borderRadius: 999, background: "rgba(247,240,223,0.1)", width: "fit-content", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {org.preferred_language.toUpperCase()}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
                padding: "3px 10px", borderRadius: 999, width: "fit-content",
                background: org.is_active ? "rgba(164,200,163,0.15)" : "rgba(214,160,140,0.15)",
                color: org.is_active ? "#a4c8a3" : "#d6a08c",
              }}>
                {org.is_active ? "Active" : "Inactive"}
              </span>
            </div>
          ))}
          {organizations.length === 0 && (
            <p style={{ margin: "12px 0 0", opacity: 0.5 }}>No organizations yet. Add the first one.</p>
          )}
        </div>
      </div>
    </main>
  );
}
