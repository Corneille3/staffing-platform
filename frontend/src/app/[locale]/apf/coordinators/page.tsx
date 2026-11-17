import { getTranslations } from "next-intl/server";
import { Link } from "../../../../i18n/navigation";
import { Eyebrow, Mono } from "../../../../components/ui";
import { getCoordinators } from "../../../../lib/api";
import { RemoveUserButton } from "../../../../components/remove-user-button";
import { HideOnReadOnlyVisit } from "../../../../components/read-only-visit";
import { CoordinatorPhoneCell } from "../../../../components/coordinator-phone-cell";

const CARD_STYLE: React.CSSProperties = {
  background: "var(--card)",
  border: "0.5px solid var(--line)",
};

export default async function CoordinatorsPage() {
  const coordinators = await getCoordinators();
  const t = await getTranslations("apf.coordinators");
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
            href="/apf/coordinators/new"
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
            {t("invite")}
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
            {tl.rich("records", { count: coordinators.length, m: (chunks) => <Mono>{chunks}</Mono> })}
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.8fr 0.6fr 1.4fr 2fr 0.8fr 0.7fr",
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
          <span>{tl("colPhone")}</span>
          <span>{t("colOrgs")}</span>
          <span>{tl("colStatus")}</span>
          <span></span>
        </div>

        <div style={{ display: "grid" }}>
          {coordinators.map((coord) => (
            <div
              key={coord.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1.8fr 0.6fr 1.4fr 2fr 0.8fr 0.7fr",
                gap: 12,
                padding: "14px",
                alignItems: "center",
                borderBottom: "0.5px solid var(--line-soft)",
              }}
            >
              <div>
                <div style={{ fontWeight: 500, fontSize: 14, color: "var(--ink)" }}>
                  {coord.first_name} {coord.last_name}
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{coord.email}</div>
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
                {tAdmin.has(`languages.${coord.preferred_language}`) ? tAdmin(`languages.${coord.preferred_language}`) : coord.preferred_language.toUpperCase()}
              </span>

              <CoordinatorPhoneCell coordinatorId={coord.id} initialPhone={coord.phone} />

              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {coord.organizations.length > 0 ? (
                  coord.organizations.map((org) => (
                    <span
                      key={org.id}
                      style={{
                        padding: "3px 10px",
                        borderRadius: 999,
                        background: "var(--paper)",
                        color: "var(--ink)",
                        fontSize: 12,
                        fontWeight: 500,
                        border: "0.5px solid var(--line)",
                      }}
                    >
                      {org.name}
                    </span>
                  ))
                ) : (
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{t("noOrgs")}</span>
                )}
              </div>

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
                  color: coord.is_active ? "var(--moss)" : "var(--rose)",
                  border: `0.5px solid ${coord.is_active ? "var(--moss)" : "var(--rose)"}`,
                }}
              >
                {coord.is_active ? tl("active") : tl("inactive")}
              </span>

              <div style={{ justifySelf: "end" }}>
                <HideOnReadOnlyVisit>
                  <RemoveUserButton
                    userId={coord.id}
                    userName={`${coord.first_name} ${coord.last_name}`}
                    isActive={coord.is_active}
                  />
                </HideOnReadOnlyVisit>
              </div>
            </div>
          ))}

          {coordinators.length === 0 && (
            <p style={{ margin: "12px 0 0", color: "var(--ink-3)" }}>
              {t("empty")}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
