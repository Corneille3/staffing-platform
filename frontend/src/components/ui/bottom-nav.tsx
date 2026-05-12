"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LucideIcon } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
}

interface BottomNavProps {
  items: NavItem[];
}

export function BottomNav({ items }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        background: "#fff",
        borderTop: "0.5px solid var(--line)",
        padding: "10px 24px 26px",
        display: "flex",
        justifyContent: "space-around",
      }}
    >
      {items.map(({ href, label, Icon }) => {
        const active =
          pathname === href || (href !== "/worker" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            style={{
              textDecoration: "none",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              color: active ? "var(--ink)" : "var(--ink-3)",
              minWidth: 44,
            }}
          >
            <Icon size={20} strokeWidth={active ? 2 : 1.6} />
            <span
              style={{
                fontSize: 10,
                fontWeight: active ? 600 : 500,
                letterSpacing: ".02em",
              }}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
