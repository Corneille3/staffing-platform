import React from "react";
import Link from "next/link";
import { Activity, Briefcase, Settings, Shield, Sparkles } from "lucide-react";
import { HeaderSignOutButton } from "../../../components/header-sign-out-button";
import { requireServerSession } from "../../../lib/api";

const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

// Tier-0 operator chrome (MULTITENANCY_HANDOFF §5.1). Distinct from the tenant
// /apf shell: near-black sidebar + "OS" badge + aggregate-only framing.
const NAV: { key: string; label: string; href?: string; icon: React.ReactNode }[] = [
  { key: "overview", label: "Overview", icon: <Activity size={16} /> },
  { key: "tenants", label: "Tenants", href: "/platform/tenants", icon: <Briefcase size={16} /> },
  { key: "billing", label: "Billing", icon: <Sparkles size={16} /> },
  { key: "settings", label: "Settings", icon: <Settings size={16} /> },
];

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  if (CLERK_ENABLED) {
    await requireServerSession(["platform_admin"]);
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--paper)", color: "var(--ink)" }}>
      <aside
        style={{
          width: 236,
          flexShrink: 0,
          background: "#0E0D0A",
          color: "var(--paper)",
          padding: "18px 14px",
          display: "flex",
          flexDirection: "column",
          position: "sticky",
          top: 0,
          alignSelf: "flex-start",
          height: "100vh",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px 18px" }}>
          <span style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 400, color: "var(--paper)" }}>
            Staffig
          </span>
          <span
            style={{
              marginLeft: "auto",
              fontSize: 9,
              color: "#0E0D0A",
              background: "var(--terra)",
              padding: "2px 6px",
              borderRadius: 4,
              letterSpacing: ".06em",
              fontWeight: 700,
            }}
          >
            OS
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px",
            background: "rgba(255,255,255,.05)",
            borderRadius: 10,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              background: "var(--terra)",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            S
          </div>
          <div style={{ flex: 1, lineHeight: 1.15 }}>
            <div style={{ fontSize: 12, fontWeight: 500 }}>StaffiG Operator</div>
            <div style={{ fontSize: 10, color: "rgba(246,244,238,.5)" }}>Platform · all regions</div>
          </div>
        </div>

        <div
          style={{
            fontSize: 9,
            color: "rgba(246,244,238,.4)",
            letterSpacing: ".14em",
            textTransform: "uppercase",
            padding: "8px 10px 6px",
          }}
        >
          Operate
        </div>
        {NAV.map((item) => {
          const active = item.key === "tenants";
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

        <div style={{ flex: 1 }} />
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(255,255,255,.04)",
            border: "0.5px solid rgba(255,255,255,.08)",
          }}
        >
          <div
            style={{
              fontSize: 9,
              color: "rgba(246,244,238,.45)",
              letterSpacing: ".1em",
              textTransform: "uppercase",
              marginBottom: 6,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Shield size={11} />
            Isolation
          </div>
          <div style={{ fontSize: 11, color: "rgba(246,244,238,.6)", lineHeight: 1.4 }}>
            Aggregate metrics only. The operator never sees inside a tenant&apos;s data.
          </div>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            background: "var(--paper)",
            borderBottom: "0.5px solid var(--line)",
            padding: "14px 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Platform Operator</span>
          {CLERK_ENABLED ? <HeaderSignOutButton /> : null}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      </main>
    </div>
  );
}
