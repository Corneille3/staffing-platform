import { PauseCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { HeaderSignOutButton } from "./header-sign-out-button";

/** Full-page lockout shown to a suspended tenant's users (the backend
 * rejects every tenant-scoped request with 403 — this is the friendly
 * face of that). Platform operators never see this: their scope drops
 * the tenant instead, so they can still reach /platform to reactivate. */
export function WorkspaceSuspendedScreen() {
  const t = useTranslations("admin.suspended");
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--paper)",
        color: "var(--ink)",
        fontFamily: "var(--ui)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 36,
      }}
    >
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <div
          style={{
            width: 56,
            height: 56,
            margin: "0 auto 18px",
            borderRadius: "50%",
            background: "var(--sand-soft, rgba(232,201,122,.2))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <PauseCircle size={26} style={{ color: "#8C6B14" }} />
        </div>
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
            fontSize: 34,
            lineHeight: 1.1,
            margin: "0 0 10px",
          }}
        >
          {t("titleLead")} <em style={{ fontStyle: "italic" }}>{t("titleEm")}</em>
        </h1>
        <p style={{ margin: "0 0 24px", color: "var(--ink-2)", fontSize: 14, lineHeight: 1.55 }}>
          {t("body")}
        </p>
        <HeaderSignOutButton />
      </div>
    </div>
  );
}
