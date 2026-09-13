"use client";

import { LucideIcon } from "lucide-react";
import { Link, usePathname } from "../../i18n/navigation";

interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
  /** Short text for a terra pill on the icon ("3", "9+"); null/undefined hides it. */
  badge?: string | null;
}

interface BottomNavProps {
  items: NavItem[];
}

/** Worker bottom nav. Étape 6 of the worker-screens plan: 11 px labels,
 * the active tab on moss (colour rule: moss = active), a terra pill on a
 * tab that has something new. */
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
        padding: "10px 0 26px",
      }}
    >
      <div style={{
        maxWidth: 560,
        margin: "0 auto",
        display: "flex",
        justifyContent: "space-around",
        padding: "0 8px",
      }}>
      {items.map(({ href, label, Icon, badge }) => {
        const active =
          pathname === href || (href !== "/worker" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            style={{
              textDecoration: "none",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              color: active ? "var(--moss)" : "var(--ink-3)",
              minWidth: 44,
              minHeight: 44,
              justifyContent: "flex-end",
            }}
          >
            <span style={{ position: "relative", display: "inline-flex" }}>
              <Icon size={20} strokeWidth={active ? 2 : 1.6} />
              {badge ? (
                <span
                  aria-label={badge}
                  style={{
                    position: "absolute",
                    top: -6,
                    left: 12,
                    minWidth: 16,
                    height: 16,
                    padding: "0 4px",
                    borderRadius: 99,
                    background: "var(--terra)",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 600,
                    lineHeight: "16px",
                    textAlign: "center",
                    boxSizing: "border-box",
                    boxShadow: "0 0 0 2px #fff",
                  }}
                >
                  {badge}
                </span>
              ) : null}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: active ? 600 : 500,
                letterSpacing: ".02em",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </span>
          </Link>
        );
      })}
      </div>
    </nav>
  );
}
