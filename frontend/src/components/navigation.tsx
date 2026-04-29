"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/organizations", label: "Organizations" },
  { href: "/workers", label: "Workers" },
  { href: "/requests", label: "Requests" },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
      }}
    >
      {links.map((link) => {
        const active = pathname === link.href;

        return (
          <Link
            key={link.href}
            href={link.href}
            style={{
              textDecoration: "none",
              padding: "10px 16px",
              borderRadius: 999,
              background: active ? "#183229" : "rgba(24, 50, 41, 0.08)",
              color: active ? "#f7f0df" : "#183229",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
