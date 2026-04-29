import { PageFrame } from "../../components/page-frame";
import { Panel } from "../../components/panel";
import { getOrganizations } from "../../lib/api";

export default async function OrganizationsPage() {
  const organizations = await getOrganizations();

  return (
    <PageFrame
      eyebrow="Network Directory"
      title="Organizations"
      description="Each organization operates independently, while APF keeps network-level visibility across sites, contacts, and language preferences."
    >
      <Panel title="Active organizations" subtitle={`${organizations.length} listed`}>
        <div style={{ display: "grid", gap: 16 }}>
          {organizations.map((organization) => (
            <article
              key={organization.id}
              style={{
                borderRadius: 22,
                padding: 20,
                background: "#fffdf7",
                border: "1px solid rgba(24, 50, 41, 0.1)",
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
                <h2 style={{ margin: 0, fontSize: 24 }}>{organization.name}</h2>
                <span
                  style={{
                    borderRadius: 999,
                    padding: "6px 12px",
                    background: organization.is_active ? "#d2ead8" : "#ead2d2",
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {organization.is_active ? "active" : "inactive"}
                </span>
              </div>
              <div style={{ color: "#3d564c", display: "grid", gap: 6 }}>
                <span>
                  {organization.city}
                  {organization.region ? `, ${organization.region}` : ""}
                </span>
                <span>Type: {organization.type.replace(/_/g, " ")}</span>
                <span>Preferred language: {organization.preferred_language}</span>
                <span>Contact: {organization.contact_email || "none"} {organization.contact_phone ? `· ${organization.contact_phone}` : ""}</span>
              </div>
            </article>
          ))}
        </div>
      </Panel>
    </PageFrame>
  );
}
