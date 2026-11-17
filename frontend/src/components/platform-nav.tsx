"use client";

import { Link } from "../i18n/navigation";
import React from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Activity, Briefcase, Settings, Sparkles, Target } from "lucide-react";
import type { PlatformOperatorRole } from "../lib/types";

// Tier-0 operator nav (MULTITENANCY_HANDOFF §5.1 / PLATFORM_HANDOFF). Items
// without an href are not built yet and render disabled. Labels come from
// `platform.nav.<key>`.
const NAV: { key: string; href?: string; icon: React.ReactNode }[] = [
  { key: "overview", icon: <Activity size={16} /> },
  { key: "tenants", href: "/platform/tenants", icon: <Briefcase size={16} /> },
  { key: "leads", href: "/platform/leads", icon: <Target size={16} /> },
  { key: "billing", icon: <Sparkles size={16} /> },
  { key: "settings", href: "/platform/settings", icon: <Settings size={16} /> },
];

/** Which entries a tier-0 role gets. The sales pipeline belongs to owner +
 * marketing; marketing gets nothing else. null = dev mode, everything. */
function visibleFor(role: PlatformOperatorRole | null, key: string): boolean {
  if (role === null || role === "owner") return true;
  if (role === "marketing") return key === "leads";
  return key !== "leads";
}

export function PlatformNav({ operatorRole = null }: { operatorRole?: PlatformOperatorRole | null }) {
  const pathname = usePathname();
  const t = useTranslations("platform.nav");

  return (
    <>
      {NAV.filter((item) => visibleFor(operatorRole, item.key)).map((item) => {
        const active = !!item.href && (pathname?.includes(item.href) ?? false);
        const row = (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "7px 10px",
              borderRadius: 8,
              background: active ? "rgba(255,255,255,.08)" : "transparent",
              color: active ? "var(--paper)" : "rgba(246,244,238,.65)",
              fontSize: 13,
              fontWeight: active ? 500 : 400,
              marginBottom: 2,
              cursor: item.href ? "pointer" : "default",
              opacity: item.href ? 1 : 0.55,
            }}
          >
            <span style={{ color: active ? "var(--terra)" : "rgba(246,244,238,.45)" }}>{item.icon}</span>
            {t(item.key)}
          </div>
        );
        return item.href ? (
          <Link key={item.key} href={item.href} style={{ textDecoration: "none" }}>
            {row}
          </Link>
        ) : (
          <div key={item.key}>{row}</div>
        );
      })}
    </>
  );
}
