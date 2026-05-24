"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Briefcase, History, User as UserIcon, Zap } from "lucide-react";
import type { ComponentType } from "react";

interface NavItem {
  href: string;
  label: string;
  Icon: ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
}

const links: NavItem[] = [
  { href: "/admin",               label: "Coverage Desk",  Icon: Activity },
  { href: "/admin/requests",      label: "Requests",       Icon: Zap },
  { href: "/admin/substitutes",   label: "Substitutes",    Icon: UserIcon },
  { href: "/admin/organizations", label: "Organizations",  Icon: Briefcase },
  { href: "/admin/activity",      label: "Activity",       Icon: History },
];

export function AdminNavigation() {
  const pathname = usePathname();
  // Strip any [locale] prefix so /en/admin/requests still matches /admin/requests.
  const strippedPath = pathname.replace(/^\/(?:en|fr)(?=\/|$)/, "") || "/";

  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {links.map(({ href, label, Icon }) => {
        const active =
          strippedPath === href ||
          (href !== "/admin" && strippedPath.startsWith(href));

        return (
          <Link
            key={href}
            href={href}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 8,
              textDecoration: "none",
              fontSize: 13,
              fontWeight: active ? 500 : 400,
              color: active ? "var(--ink)" : "var(--ink-2)",
              background: active ? "var(--card)" : "transparent",
              border: active ? "0.5px solid var(--line)" : "0.5px solid transparent",
              transition: "color .12s, background .12s",
            }}
          >
            <Icon
              size={15}
              strokeWidth={1.6}
              color={active ? "var(--terra)" : "var(--ink-3)"}
            />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
