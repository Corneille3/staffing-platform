"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ApfNavigation() {
  const pathname = usePathname();
  const strippedPath = pathname.replace(/^\/(?:en|fr)(?=\/|$)/, "") || "/";

  // Tenant-admin workspace nav. (Cross-tenant management lives in the platform
  // OS surface at /platform — no "Networks" link here anymore.)
  const links = [
    { href: "/apf", label: "Overview" },
    { href: "/apf/organizations", label: "Organizations" },
    { href: "/apf/coordinators", label: "Coordinators" },
    { href: "/apf/substitutes", label: "Substitutes" },
    { href: "/apf/activity", label: "Activity" },
    { href: "/apf/export", label: "Export" },
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
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
