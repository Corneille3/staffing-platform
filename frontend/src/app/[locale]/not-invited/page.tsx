import { TriangleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "../../../i18n/navigation";
import { EdgeLanguageToggle } from "../../../components/ui";

export default async function NotInvitedPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  const t = await getTranslations("edge.notInvited");

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--paper)",
        fontFamily: "var(--ui)",
        display: "flex",
        padding: 36,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Logo */}
      <div
        style={{
          position: "absolute",
          top: 24,
          left: 28,
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: "var(--ink)",
        }}
      >
        <div style={{ width: 22, height: 22, borderRadius: 6, background: "var(--terra)" }} />
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>Staffig</span>
      </div>

      {/* Center */}
      <div style={{ margin: "auto", width: 460, textAlign: "left" }}>
        {/* Warning icon */}
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: 99,
            background: "var(--sand-soft)",
            color: "#8C6B14",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
            border: "0.5px solid #E2D49A",
          }}
        >
          <TriangleAlert size={22} />
        </div>

        {/* Eyebrow */}
        <div
          style={{
            fontSize: 10,
            letterSpacing: ".14em",
            textTransform: "uppercase",
            fontWeight: 500,
            color: "#8C6B14",
            marginBottom: 8,
          }}
        >
          {t("eyebrow")}
        </div>

        <h1
          style={{
            fontFamily: "var(--serif)",
            fontSize: 46,
            lineHeight: 1.05,
            margin: "0 0 14px",
            color: "var(--ink)",
          }}
        >
          {t.rich("title", {
            em: (chunks) => <em style={{ fontStyle: "italic" }}>{chunks}</em>,
          })}
        </h1>

        <p
          style={{
            margin: "0 0 22px",
            color: "var(--ink-2)",
            fontSize: 14,
            lineHeight: 1.55,
          }}
        >
          {t("blurb")}{" "}
          {email
            ? t.rich("signedInAs", {
                email,
                strong: (chunks) => (
                  <strong style={{ fontWeight: 500, color: "var(--ink)" }}>{chunks}</strong>
                ),
              })
            : t("noRecord")}
        </p>

        {/* Two ways forward */}
        <div
          style={{
            background: "var(--card)",
            border: "0.5px solid var(--line)",
            borderRadius: 16,
            padding: "16px 18px",
            marginBottom: 22,
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: ".14em",
              textTransform: "uppercase",
              fontWeight: 500,
              color: "var(--ink-3)",
              marginBottom: 10,
            }}
          >
            {t("twoWays")}
          </div>
          <div
            style={{
              display: "flex",
              gap: 14,
              padding: "10px 0",
              borderBottom: "0.5px solid var(--line-soft)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--serif)",
                fontSize: 24,
                width: 24,
                flexShrink: 0,
                color: "var(--terra)",
              }}
            >
              1
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
              <strong style={{ color: "var(--ink)", fontWeight: 500 }}>{t("way1Title")}</strong>{" "}
              {t("way1Body")}
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, padding: "10px 0" }}>
            <div
              style={{
                fontFamily: "var(--serif)",
                fontSize: 24,
                width: 24,
                flexShrink: 0,
                color: "var(--terra)",
              }}
            >
              2
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
              <strong style={{ color: "var(--ink)", fontWeight: 500 }}>{t("way2Title")}</strong>{" "}
              {t("way2Body")}
            </div>
          </div>
        </div>

        <Link
          href="/sign-in"
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "11px 22px",
            borderRadius: 999,
            background: "var(--ink)",
            color: "var(--paper)",
            fontSize: 13,
            fontWeight: 500,
            textDecoration: "none",
            fontFamily: "var(--ui)",
          }}
        >
          {t("cta")}
        </Link>
      </div>

      <EdgeLanguageToggle />

      {/* Decorative circles */}
      <svg
        style={{ position: "absolute", right: -100, bottom: -80, pointerEvents: "none" }}
        width="380"
        height="380"
        viewBox="0 0 200 200"
        fill="none"
      >
        <circle cx="100" cy="100" r="90" stroke="#DC5A2A" strokeWidth=".6" strokeDasharray="2 3" />
        <circle cx="100" cy="100" r="60" stroke="#15140F" strokeWidth=".6" />
        <circle cx="100" cy="100" r="4" fill="#DC5A2A" />
      </svg>
    </div>
  );
}
