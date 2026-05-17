"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin", label: "Coverage Desk" },
  { href: "/admin/requests", label: "Requests" },
  { href: "/admin/workers", label: "Substitutes" },
  { href: "/admin/organizations", label: "Organizations" },
];

export function AdminNavigation() {
  const pathname = usePathname();
  // Strip any [locale] prefix so /en/admin/requests still matches /admin/requests.
  const strippedPath = pathname.replace(/^\/(?:en|fr)(?=\/|$)/, "") || "/";

  return (
    <nav style={{ display: "flex", flexWrap: "wrap", gap: 22 }}>
      {links.map((link) => {
        const active =
          strippedPath === link.href ||
          (link.href !== "/admin" && strippedPath.startsWith(link.href));

        return (
          <Link
            key={link.href}
            href={link.href}
            style={{
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 500,
              color: active ? "var(--ink)" : "var(--ink-2)",
              paddingBottom: 6,
              borderBottom: active ? "2px solid var(--terra)" : "2px solid transparent",
              transition: "color .12s",
            }}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
