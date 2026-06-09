import { SignIn } from "@clerk/nextjs";
import { getTranslations } from "next-intl/server";
import { EdgeLanguageToggle } from "../../../../components/ui";

const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default async function SignInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("edge.signIn");

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
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: "var(--terra)",
          }}
        />
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>
          Staffig
        </span>
      </div>

      {/* Center */}
      <div style={{ margin: "auto", width: 380 }}>
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
          {t("eyebrow")}
        </div>
        <h1
          style={{
            fontFamily: "var(--serif)",
            fontSize: 46,
            lineHeight: 1.05,
            margin: "0 0 8px",
          }}
        >
          {t.rich("title", {
            em: (chunks) => <em style={{ fontStyle: "italic" }}>{chunks}</em>,
          })}
        </h1>
        <p
          style={{
            margin: "0 0 26px",
            color: "var(--ink-2)",
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          {t("blurb")}
        </p>
        {/* Locale-prefixed path + cross-link: keeps Clerk's multi-step
            routing inside the current locale (no middleware redirect hop).
            Dev (no Clerk key): the widget would crash outside ClerkProvider,
            so render a placeholder — keeps the page verifiable locally. */}
        {CLERK_ENABLED ? (
          // fallbackRedirectUrl → the locale root, whose page routes by DB role
          // (/apf → /welcome for a new tenant admin, /admin for a coordinator,
          // /worker for a substitute). Never hardcode a surface here: this widget
          // serves every role. Fallback (not force) preserves ?redirect_url deep links.
          <SignIn
            path={`/${locale}/sign-in`}
            signUpUrl={`/${locale}/sign-up`}
            fallbackRedirectUrl={`/${locale}`}
          />
        ) : (
          <div
            style={{
              padding: "22px 24px",
              border: "0.5px dashed var(--line)",
              borderRadius: 14,
              fontSize: 12.5,
              color: "var(--ink-3)",
            }}
          >
            Clerk is not configured — the sign-in form renders here in
            production. Use the dev role-switcher instead.
          </div>
        )}
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
