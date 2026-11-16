"use client";

import { useClerk } from "@clerk/nextjs";
import { useLocale, useTranslations } from "next-intl";

interface Props {
  tone?: "light" | "dark";
}

export function HeaderSignOutButton({ tone = "light" }: Props = {}) {
  const { signOut } = useClerk();
  const locale = useLocale();
  const t = useTranslations("common");

  async function handleSignOut() {
    window.localStorage.removeItem("apf.workerId");
    window.localStorage.removeItem("apf.devRole");
    await signOut({ redirectUrl: `/${locale}/sign-in` });
  }

  const isDark = tone === "dark";
  return (
    <button
      type="button"
      onClick={handleSignOut}
      style={{
        background: "transparent",
        border: `0.5px solid ${isDark ? "rgba(229, 225, 211, 0.32)" : "var(--line)"}`,
        borderRadius: 999,
        padding: "8px 14px",
        color: isDark ? "var(--paper)" : "var(--ink-2)",
        font: "inherit",
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      {t("signOut")}
    </button>
  );
}
