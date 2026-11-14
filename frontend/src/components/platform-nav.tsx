"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Briefcase, Settings, Sparkles, Target } from "lucide-react";
import type { PlatformOperatorRole } from "../lib/types";

// Tier-0 operator nav (MULTITENANCY_HANDOFF §5.1 / PLATFORM_HANDOFF). Items
// without an href are not built yet and render disabled.
const NAV: { key: string; label: string; href?: string; icon: React.ReactNode }[] = [
  { key: "overview", label: "Overview", icon: <Activity size={16} /> },
  { key: "tenants", label: "Tenants", href: "/platform/tenants", icon: <Briefcase size={16} /> },
  { key: "leads", label: "Leads", href: "/platform/leads", icon: <Target size={16} /> },
  { key: "billing", label: "Billing", icon: <Sparkles size={16} /> },
  { key: "settings", label: "Settings", href: "/platform/settings", icon: <Settings size={16} /> },
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
            {item.label}
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
