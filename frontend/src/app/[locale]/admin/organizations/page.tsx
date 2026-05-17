import { PageFrame } from "../../../../components/page-frame";
import { Panel } from "../../../../components/panel";
import { getOrganizations } from "../../../../lib/api";

const ORG_TYPE_LABELS: Record<string, string> = {
  childcare: "Childcare",
  long_term_care: "Long-term care",
  community_care: "Community care",
  home_care: "Home care",
  assisted_living: "Assisted living",
  other: "Other",
};

export default async function OrganizationsPage() {
  const organizations = await getOrganizations();

  return (
    <PageFrame
      eyebrow="Network Directory"
      title="Organizations"
      description="Each organization operates independently while Staffig keeps network-level visibility across sites, contacts, and language preferences."
    >
      <Panel title="Active organizations" subtitle={`${organizations.length} listed`}>
        <div style={{ display: "grid", gap: 12 }}>
          {organizations.map((organization) => (
            <article
              key={organization.id}
              style={{
                borderRadius: 14,
                padding: 18,
                background: "var(--paper-2)",
                border: "0.5px solid var(--line)",
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
                <h2 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 20, lineHeight: 1.15, fontWeight: 400 }}>
                  {organization.name}
                </h2>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    borderRadius: 999,
                    padding: "4px 10px",
                    background: organization.is_active ? "var(--moss-soft)" : "var(--rose-soft)",
                    color: organization.is_active ? "var(--moss)" : "var(--rose)",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.03em",
                  }}
                >
                  {organization.is_active ? "active" : "inactive"}
                </span>
              </div>
              <div style={{ color: "var(--ink-2)", display: "grid", gap: 4, fontSize: 13 }}>
                <span>
                  {organization.city}
                  {organization.region ? `, ${organization.region}` : ""}
                </span>
                <span>Type: {ORG_TYPE_LABELS[organization.type] ?? organization.type.replace(/_/g, " ")}</span>
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
