import { HideOnReadOnlyVisit } from "../../../../components/read-only-visit";
import Link from "next/link";
import { RemoveOrganizationButton } from "../../../../components/remove-organization-button";
import { Eyebrow, Mono } from "../../../../components/ui";
import { getOrganizations } from "../../../../lib/api";

const ORG_TYPE_LABEL: Record<string, string> = {
  childcare: "Childcare",
  long_term_care: "Long-term Care",
  community_care: "Community Care",
  home_care: "Home Care",
  assisted_living: "Assisted Living",
  other: "Other",
};

const CARD_STYLE: React.CSSProperties = {
  background: "var(--card)",
  border: "0.5px solid var(--line)",
};

export default async function OrganizationsPage() {
  const organizations = await getOrganizations();

  return (
    <>
      <section style={{ marginBottom: 32 }}>
        <Eyebrow style={{ marginBottom: 12 }}>Network Management</Eyebrow>
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
          <em style={{ fontStyle: "italic" }}>Organizations</em>
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
            Member organizations registered under this network. Each organization can have one or more coordinators.
          </p>
          <HideOnReadOnlyVisit>
          <Link
            href="/apf/organizations/new"
            style={{
              display: "inline-block",
              padding: "10px 18px",
              borderRadius: 999,
              background: "var(--terra)",
              color: "var(--paper)",
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "none",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            + New organization
          </Link>
          </HideOnReadOnlyVisit>
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
            All organizations
          </h2>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            <Mono>{organizations.length}</Mono> {organizations.length === 1 ? "record" : "records"}
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1.2fr 1fr 1fr 0.8fr 0.6fr",
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
          <span>Name</span>
          <span>Type</span>
          <span>City</span>
          <span>Language</span>
          <span>Status</span>
          <span />
        </div>

        <div style={{ display: "grid" }}>
          {organizations.map((org) => (
            <div
              key={org.id}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1.2fr 1fr 1fr 0.8fr 0.6fr",
                gap: 12,
                padding: "14px",
                alignItems: "center",
                borderBottom: "0.5px solid var(--line-soft)",
              }}
            >
              <Link
                href={`/apf/organizations/${org.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div style={{ fontWeight: 500, fontSize: 14, color: "var(--ink)" }}>{org.name}</div>
                {org.contact_email && (
                  <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                    {org.contact_email}
                  </div>
                )}
              </Link>
              <span style={{ fontSize: 13, color: "var(--ink)" }}>
                {ORG_TYPE_LABEL[org.type] ?? org.type}
              </span>
              <span style={{ fontSize: 13, color: "var(--ink)" }}>{org.city}</span>
              <span
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: "var(--paper)",
                  width: "fit-content",
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--ink)",
                  border: "0.5px solid var(--line)",
                }}
              >
                {org.preferred_language.toUpperCase()}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  padding: "3px 10px",
                  borderRadius: 999,
                  width: "fit-content",
                  background: "var(--paper)",
                  color: org.is_active ? "var(--moss)" : "var(--rose)",
                  border: `0.5px solid ${org.is_active ? "var(--moss)" : "var(--rose)"}`,
                }}
              >
                {org.is_active ? "Active" : "Inactive"}
              </span>
              <HideOnReadOnlyVisit fallback={<span />}>
                <RemoveOrganizationButton organizationId={org.id} organizationName={org.name} />
              </HideOnReadOnlyVisit>
            </div>
          ))}
          {organizations.length === 0 && (
            <p style={{ margin: "12px 0 0", color: "var(--ink-3)" }}>
              No organizations yet. Add the first one.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
