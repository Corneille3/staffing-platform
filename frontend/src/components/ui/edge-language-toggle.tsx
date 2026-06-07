"use client";

import { useLocale } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "../../i18n/navigation";
import { routing } from "../../i18n/routing";

/** The minimal "EN · FR" corner toggle on the edge pages (sign-in, sign-up,
 * not-invited). Same switch mechanics as LanguageSwitcher, but rendered as
 * plain text per the edge-page design — the active locale is inert, the
 * other underlined. Preserves the query string (?email= on not-invited,
 * Clerk params on sign-in). */
export function EdgeLanguageToggle() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchTo(nextLocale: string) {
    if (nextLocale === locale) return;
    const search = typeof window === "undefined" ? "" : window.location.search;
    startTransition(() => {
      router.replace(`${pathname}${search}`, {
        locale: nextLocale as (typeof routing.locales)[number],
      });
    });
  }

  return (
    <div
      role="group"
      aria-label="Language"
      style={{
        position: "absolute",
        bottom: 32,
        left: 28,
        fontSize: 11,
        color: "var(--ink-3)",
        opacity: isPending ? 0.5 : 1,
      }}
    >
      {routing.locales.map((loc, i) => {
        const active = loc === locale;
        return (
          <span key={loc}>
            {i > 0 && " · "}
            {active ? (
              <span style={{ fontWeight: 600, color: "var(--ink-2)" }}>{loc.toUpperCase()}</span>
            ) : (
              <button
                type="button"
                onClick={() => switchTo(loc)}
                disabled={isPending}
                style={{
                  padding: 0,
                  border: "none",
                  background: "none",
                  font: "inherit",
                  color: "inherit",
                  textDecoration: "underline",
                  cursor: isPending ? "wait" : "pointer",
                }}
              >
                {loc.toUpperCase()}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
