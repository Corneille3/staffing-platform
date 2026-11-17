import { getTranslations } from "next-intl/server";
import { Link } from "../../../../i18n/navigation";
import { HideOnReadOnlyVisit } from "../../../../components/read-only-visit";
import { RemoveOrganizationButton } from "../../../../components/remove-organization-button";
import { Eyebrow, Mono } from "../../../../components/ui";
import { getOrganizations } from "../../../../lib/api";

const CARD_STYLE: React.CSSProperties = {
  background: "var(--card)",
  border: "0.5px solid var(--line)",
};

export default async function OrganizationsPage() {
  const organizations = await getOrganizations();
  const t = await getTranslations("apf.organizations");
  const tl = await getTranslations("apf.lists");
  const tAdmin = await getTranslations("admin");

  return (
    <>
      <section style={{ marginBottom: 32 }}>
        <Eyebrow style={{ marginBottom: 12 }}>{tl("eyebrow")}</Eyebrow>
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
          <em style={{ fontStyle: "italic" }}>{t("title")}</em>
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
            {t("new")}
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
            {t("all")}
          </h2>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {tl.rich("records", { count: organizations.length, m: (chunks) => <Mono>{chunks}</Mono> })}
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
          <span>{tl("colName")}</span>
          <span>{tl("colType")}</span>
          <span>{tl("colCity")}</span>
          <span>{tl("colLanguage")}</span>
          <span>{tl("colStatus")}</span>
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
                {tAdmin.has(`organizations.types.${org.type}`) ? tAdmin(`organizations.types.${org.type}`) : org.type}
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
                {org.is_active ? tl("active") : tl("inactive")}
              </span>
              <HideOnReadOnlyVisit fallback={<span />}>
                <RemoveOrganizationButton organizationId={org.id} organizationName={org.name} />
              </HideOnReadOnlyVisit>
            </div>
          ))}
          {organizations.length === 0 && (
            <p style={{ margin: "12px 0 0", color: "var(--ink-3)" }}>
              {t("empty")}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
