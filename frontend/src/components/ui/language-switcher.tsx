"use client";

import { useLocale } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "../../i18n/navigation";
import { routing } from "../../i18n/routing";

export function LanguageSwitcher({ style }: { style?: React.CSSProperties }) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchTo(nextLocale: string) {
    if (nextLocale === locale) return;
    // Keep the query string: the console lists hold their filters in the
    // URL (/admin/requests?status=…, /platform/leads?…), and a language
    // switch must not drop them. Read at click time, like EdgeLanguageToggle,
    // so no useSearchParams Suspense boundary is needed.
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
        display: "inline-flex",
        alignItems: "center",
        gap: 0,
        border: "0.5px solid var(--line)",
        borderRadius: 99,
        padding: 2,
        background: "var(--card)",
        opacity: isPending ? 0.5 : 1,
        ...style,
      }}
    >
      {routing.locales.map((loc) => {
        const active = loc === locale;
        return (
          <button
            key={loc}
            type="button"
            onClick={() => switchTo(loc)}
            disabled={isPending}
            style={{
              padding: "6px 14px",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              border: "none",
              borderRadius: 99,
              background: active ? "var(--ink)" : "transparent",
              color: active ? "var(--paper)" : "var(--ink-3)",
              cursor: isPending ? "wait" : "pointer",
              fontFamily: "var(--mono)",
              minHeight: 28,
            }}
          >
            {loc}
          </button>
        );
      })}
    </div>
  );
}
