"use client";

import { Link } from "../i18n/navigation";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

export function ApfNavigation() {
  const pathname = usePathname();
  const t = useTranslations("apf.nav");
  const strippedPath = pathname.replace(/^\/(?:en|fr)(?=\/|$)/, "") || "/";

  // Tenant-admin workspace nav. (Cross-tenant management lives in the platform
  // OS surface at /platform — no "Networks" link here anymore.)
  const links = [
    // label = key under apf.nav
    { href: "/apf", label: "overview" },
    { href: "/apf/organizations", label: "organizations" },
    { href: "/apf/coordinators", label: "coordinators" },
    { href: "/apf/substitutes", label: "substitutes" },
    { href: "/apf/activity", label: "activity" },
    { href: "/apf/export", label: "export" },
  ];

  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {links.map((link) => {
        const active =
          strippedPath === link.href ||
          (link.href !== "/apf" && strippedPath.startsWith(link.href));

        return (
          <Link
            key={link.href}
            href={link.href}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "9px 12px",
              borderRadius: 8,
              textDecoration: "none",
              fontSize: 13,
              fontWeight: active ? 500 : 400,
              color: active ? "var(--paper)" : "rgba(246, 244, 238, 0.6)",
              background: active ? "rgba(246, 244, 238, 0.08)" : "transparent",
              border: active
                ? "0.5px solid rgba(246, 244, 238, 0.18)"
                : "0.5px solid transparent",
              borderLeft: active ? "2px solid var(--terra)" : "2px solid transparent",
              transition: "color .12s, background .12s",
            }}
          >
            {t(link.label)}
          </Link>
        );
      })}
    </nav>
  );
}
