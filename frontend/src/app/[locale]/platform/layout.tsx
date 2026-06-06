import React from "react";
import Link from "next/link";
import { ArrowUpRight, Shield } from "lucide-react";
import { HeaderSignOutButton } from "../../../components/header-sign-out-button";
import { PlatformNav } from "../../../components/platform-nav";
import { getTenantProfile, requireServerSession } from "../../../lib/api";
import type { TenantProfile } from "../../../lib/types";

const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

// Tier-0 operator chrome (MULTITENANCY_HANDOFF §5.1). Distinct from the tenant
// /apf shell: near-black sidebar + "OS" badge + aggregate-only framing.

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  if (CLERK_ENABLED) {
    await requireServerSession(["platform_admin"]);
  }

  // The operator's path into a tenant workspace, when they have one: their
  // own tenant (membership — e.g. the bootstrap admin) or a §2.2 access
  // grant (read-only). 404 = membership-less operator with no grant.
  const workspace: TenantProfile | null = await getTenantProfile().catch(() => null);

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
        <PlatformNav />

        {workspace ? (
          <>
            <div
              style={{
                fontSize: 9,
                color: "rgba(246,244,238,.4)",
                letterSpacing: ".14em",
                textTransform: "uppercase",
                padding: "16px 10px 6px",
              }}
            >
              Workspace
            </div>
            <Link href="/apf" style={{ textDecoration: "none" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,.05)",
                  border: "0.5px solid rgba(255,255,255,.1)",
                  color: "var(--paper)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {workspace.name}
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(246,244,238,.5)" }}>
                    {workspace.via_grant ? "Granted access · read-only" : "Open your workspace"}
                  </div>
                </div>
                <ArrowUpRight size={14} style={{ color: "var(--terra)", flexShrink: 0 }} />
              </div>
            </Link>
          </>
        ) : null}

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
