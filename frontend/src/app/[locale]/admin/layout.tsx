import React from "react";
import { AdminNavigation } from "../../../components/admin-navigation";
import { HeaderSignOutButton } from "../../../components/header-sign-out-button";
import { Eyebrow } from "../../../components/ui";
import { getNetworkOverview, getOrganizations, requireServerSession } from "../../../lib/api";

const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let sessionRole: string = "org_admin";
  if (CLERK_ENABLED) {
    const session = await requireServerSession(["org_admin", "network_admin", "platform_admin"]);
    sessionRole = session.role;
  }

  // Sidebar data — both calls are tenant-scoped via AccessScope and reused across
  // every /admin route, so a small parallel fetch in the layout is cheaper than
  // duplicating it on each page.
  const [overview, organizations] = await Promise.all([
    getNetworkOverview().catch(() => null),
    getOrganizations().catch(() => [] as Awaited<ReturnType<typeof getOrganizations>>),
  ]);

  // Primary org used for the switcher card. org_admin typically has one; for
  // network/platform admin we show a generic "All organizations" line.
  const primaryOrg = organizations[0];
  const isMultiOrgRole = sessionRole !== "org_admin";

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--paper)", color: "var(--ink)" }}>
      <aside
        style={{
          width: 232,
          flexShrink: 0,
          background: "var(--paper)",
          borderRight: "0.5px solid var(--line)",
          padding: "18px 14px",
          display: "flex",
          flexDirection: "column",
          position: "sticky",
          top: 0,
          alignSelf: "flex-start",
          height: "100vh",
        }}
      >
        {/* Logo + Admin pill */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px 18px" }}>
          <span
            style={{
              fontFamily: "var(--serif)",
              fontSize: 18,
              fontWeight: 400,
              letterSpacing: "-0.01em",
              color: "var(--ink)",
            }}
          >
            Staffig
          </span>
          <span
            style={{
              marginLeft: "auto",
              padding: "2px 8px",
              borderRadius: 4,
              border: "0.5px solid var(--line)",
              color: "var(--ink-3)",
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: ".14em",
              textTransform: "uppercase",
            }}
          >
            Admin
          </span>
        </div>

        {/* Org switcher card */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            background: "var(--card)",
            border: "0.5px solid var(--line)",
            borderRadius: 10,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              flexShrink: 0,
              borderRadius: 6,
              background: "var(--ink)",
              color: "var(--paper)",
              fontSize: 11,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              letterSpacing: ".02em",
            }}
          >
            {primaryOrg
              ? primaryOrg.name
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p) => p[0])
                  .join("")
                  .toUpperCase()
              : "ST"}
          </div>
          <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "var(--ink)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {isMultiOrgRole
                ? "All organizations"
                : primaryOrg?.name ?? "No organization"}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "var(--ink-3)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {isMultiOrgRole
                ? `Network · ${organizations.length} org${organizations.length === 1 ? "" : "s"}`
                : primaryOrg
                  ? `${primaryOrg.city}${primaryOrg.region ? ` · ${primaryOrg.region}` : ""}`
                  : "—"}
            </div>
          </div>
        </div>

        {/* Workspace nav */}
        <div
          style={{
            fontSize: 10,
            color: "var(--ink-3)",
            letterSpacing: ".18em",
            textTransform: "uppercase",
            fontWeight: 500,
            padding: "6px 10px 8px",
          }}
        >
          Workspace
        </div>
        <AdminNavigation />

        <div style={{ flex: 1 }} />

        {/* Pinned KPI mini-card */}
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            background: "var(--card)",
            border: "0.5px solid var(--line)",
          }}
        >
          <Eyebrow style={{ marginBottom: 6 }}>Fill rate</Eyebrow>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span
              style={{
                fontFamily: "var(--serif)",
                fontSize: 26,
                lineHeight: 1,
                fontWeight: 400,
                color: "var(--ink)",
              }}
            >
              {overview ? `${overview.fill_rate}%` : "—"}
            </span>
          </div>
          <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 4, lineHeight: 1.4 }}>
            {overview
              ? `${overview.filled_count} of ${overview.total_requests} requests filled`
              : "no data"}
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
          <Eyebrow>Operations Console</Eyebrow>
          {CLERK_ENABLED ? <HeaderSignOutButton /> : null}
        </div>
        <div style={{ flex: 1, padding: "32px 32px 64px", maxWidth: 1280, width: "100%" }}>
          {children}
        </div>
      </main>
    </div>
  );
}
