import React from "react";
import { redirect } from "next/navigation";
import { ApfNavigation } from "../../../components/apf-navigation";
import { HeaderSignOutButton } from "../../../components/header-sign-out-button";
import { Eyebrow } from "../../../components/ui";
import { getOrganizations, getTenantProfile, requireServerSession } from "../../../lib/api";

const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default async function ApfLayout({ children }: { children: React.ReactNode }) {
  let isPlatformAdmin = false;
  if (CLERK_ENABLED) {
    const session = await requireServerSession(["network_admin", "platform_admin"]);
    isPlatformAdmin = session.role === "platform_admin";
    // A tenant admin whose workspace hasn't finished onboarding goes to the
    // setup wizard (MULTITENANCY_HANDOFF §6). Platform admins skip this.
    if (!isPlatformAdmin) {
      const tenant = await getTenantProfile().catch(() => null);
      if (tenant && tenant.status !== "active") {
        redirect("/welcome");
      }
    }
  }

  let orgCount: number | null = null;
  try {
    const orgs = await getOrganizations();
    orgCount = orgs.length;
  } catch {
    orgCount = null;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--paper)", color: "var(--ink)" }}>
      <aside
        style={{
          width: 232,
          flexShrink: 0,
          background: "var(--ink)",
          color: "var(--paper)",
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px 18px" }}>
          <span
            style={{
              fontFamily: "var(--serif)",
              fontSize: 18,
              fontWeight: 400,
              letterSpacing: "-0.01em",
              color: "var(--paper)",
            }}
          >
            Staffig
          </span>
          <span
            style={{
              marginLeft: "auto",
              padding: "2px 8px",
              borderRadius: 999,
              border: "0.5px solid var(--terra)",
              color: "var(--terra)",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: ".18em",
              textTransform: "uppercase",
            }}
          >
            APF
          </span>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: "10px 12px",
            background: "rgba(246, 244, 238, 0.06)",
            border: "0.5px solid rgba(246, 244, 238, 0.12)",
            borderRadius: 10,
            marginBottom: 16,
          }}
        >
          <Eyebrow style={{ color: "rgba(246, 244, 238, 0.5)" }}>Network</Eyebrow>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--paper)" }}>Staffig Network</div>
          <div style={{ fontSize: 11, color: "rgba(246, 244, 238, 0.5)" }}>
            {orgCount != null ? `${orgCount} ${orgCount === 1 ? "organization" : "organizations"}` : "—"}
          </div>
        </div>

        <Eyebrow style={{ color: "rgba(246, 244, 238, 0.5)", padding: "0 12px 8px" }}>Workspace</Eyebrow>
        <ApfNavigation isPlatformAdmin={isPlatformAdmin} />

        <div style={{ flex: 1 }} />

        <div
          style={{
            padding: "12px",
            borderRadius: 10,
            background: "rgba(246, 244, 238, 0.04)",
            border: "0.5px solid rgba(246, 244, 238, 0.1)",
            fontSize: 11,
            lineHeight: 1.45,
            color: "rgba(246, 244, 238, 0.65)",
          }}
        >
          APF observes — it doesn&apos;t dispatch.
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
          <Eyebrow>Network Oversight</Eyebrow>
          {CLERK_ENABLED ? <HeaderSignOutButton /> : null}
        </div>
        <div style={{ flex: 1, padding: "32px 32px 64px", maxWidth: 1280, width: "100%" }}>
          {children}
        </div>
      </main>
    </div>
  );
}
