"use client";

import { Link } from "../i18n/navigation";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Activity, Briefcase, History, Repeat, User as UserIcon, Zap } from "lucide-react";
import type { ComponentType } from "react";

interface NavItem {
  href: string;
  /** Key under admin.nav. */
  label: string;
  Icon: ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
}

const links: NavItem[] = [
  { href: "/admin",               label: "desk",          Icon: Activity },
  { href: "/admin/requests",      label: "requests",      Icon: Zap },
  { href: "/admin/substitutes",   label: "substitutes",   Icon: UserIcon },
  { href: "/admin/replacements",  label: "replacements",  Icon: Repeat },
  { href: "/admin/organizations", label: "organizations", Icon: Briefcase },
  { href: "/admin/activity",      label: "activity",      Icon: History },
];

export function AdminNavigation({ openCount = 0 }: { openCount?: number }) {
  const t = useTranslations("admin.nav");
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
            <span>{t(label)}</span>
            {href === "/admin/requests" && openCount > 0 && (
              <span
                style={{
                  marginLeft: "auto",
                  minWidth: 18,
                  height: 18,
                  padding: "0 5px",
                  borderRadius: 999,
                  background: "var(--terra)",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {openCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
