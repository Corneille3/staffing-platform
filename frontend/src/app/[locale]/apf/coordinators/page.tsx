import Link from "next/link";
import { Eyebrow, Mono } from "../../../../components/ui";
import { getCoordinators } from "../../../../lib/api";
import { RemoveUserButton } from "../../../../components/remove-user-button";
import { HideOnReadOnlyVisit } from "../../../../components/read-only-visit";
import { CoordinatorPhoneCell } from "../../../../components/coordinator-phone-cell";

const LANG_LABEL: Record<string, string> = { fr: "FR", en: "EN", bilingual: "Bilingual" };

const CARD_STYLE: React.CSSProperties = {
  background: "var(--card)",
  border: "0.5px solid var(--line)",
};

export default async function CoordinatorsPage() {
  const coordinators = await getCoordinators();

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
          <em style={{ fontStyle: "italic" }}>Coordinators</em>
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
            Coordinators manage coverage requests for their assigned organizations. A coordinator can be assigned to multiple organizations.
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
            + Invite coordinator
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
            All coordinators
          </h2>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            <Mono>{coordinators.length}</Mono> {coordinators.length === 1 ? "record" : "records"}
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
          <span>Name</span>
          <span>Lang</span>
          <span>Phone</span>
          <span>Assigned organizations</span>
          <span>Status</span>
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
                {LANG_LABEL[coord.preferred_language] ?? coord.preferred_language.toUpperCase()}
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
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>No organizations assigned</span>
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
                {coord.is_active ? "Active" : "Inactive"}
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
              No coordinators yet. Invite the first one.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
