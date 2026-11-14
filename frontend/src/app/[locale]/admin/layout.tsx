import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Search, Bell, User as UserIcon } from "lucide-react";
import { AdminNavigation } from "../../../components/admin-navigation";
import { AdminOrgSwitcher } from "../../../components/admin-org-switcher";
import { AdminProfileCard } from "../../../components/admin-profile-card";
import { ReadOnlyVisitProvider } from "../../../components/read-only-visit";
import { AdminBreadcrumb } from "../../../components/admin-breadcrumb";
import { HeaderSignOutButton } from "../../../components/header-sign-out-button";
import { Eyebrow } from "../../../components/ui";
import { WorkspaceSuspendedScreen } from "../../../components/workspace-suspended";
import {
  ApiError,
  getMyProfile,
  getNetworkOverview,
  getOrganizations,
  getTenantProfile,
  requireServerSession,
} from "../../../lib/api";

const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let sessionRole: string = "org_admin";
  if (CLERK_ENABLED) {
    const session = await requireServerSession(["org_admin", "network_admin", "platform_admin"]);
    sessionRole = session.role;
    // A marketing operator owns the sales pipeline only — the API refuses
    // every workspace call, which would otherwise read as "suspended" below.
    if (session.platform_operator_role === "marketing") redirect("/platform/leads");
  }

  // Sidebar data — both calls are tenant-scoped via AccessScope and reused across
  // every /admin route, so a small parallel fetch in the layout is cheaper than
  // duplicating it on each page. A 403 means the tenant is suspended (the
  // backend rejects every tenant-scoped call at scope resolution).
  let suspended = false;
  const swallow = <T,>(fallback: T) => (err: unknown): T => {
    if (err instanceof ApiError && err.status === 403) suspended = true;
    return fallback;
  };
  const [overview, organizations, tenantProfile, myProfile] = await Promise.all([
    getNetworkOverview().catch(swallow(null)),
    getOrganizations().catch(swallow([] as Awaited<ReturnType<typeof getOrganizations>>)),
    // Only used for the grant-visit chip — a platform operator reading this
    // surface through a §2.2 access grant should see they're in read-only.
    getTenantProfile().catch(() => null),
    // Own phone + SMS switch for the sidebar card; the card just doesn't
    // render if this fails, the rest of the surface must not.
    getMyProfile().catch(() => null),
  ]);

  if (CLERK_ENABLED && suspended) {
    return <WorkspaceSuspendedScreen />;
  }

  // A tenant admin whose network hasn't finished onboarding belongs in the
  // setup wizard, not the coordinator surface. Mirrors the /apf guard so a
  // network_admin who lands on /admin (e.g. via a stale Clerk after-sign-in
  // URL or any premature route) is sent to /welcome instead of being stranded
  // here. org_admins only exist post-onboarding; a platform operator visiting
  // via grant is platform_admin, not network_admin — so neither trips this.
  if (
    CLERK_ENABLED &&
    sessionRole === "network_admin" &&
    tenantProfile &&
    tenantProfile.status !== "active"
  ) {
    redirect("/welcome");
  }
  const viaGrant = tenantProfile?.via_grant === true;

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

        {/* Org switcher */}
        <AdminOrgSwitcher
          sites={organizations.map((o) => ({ id: o.id, name: o.name, city: o.city }))}
          multiOrg={isMultiOrgRole}
          label={isMultiOrgRole ? "All organizations" : primaryOrg?.name ?? "No organization"}
          sublabel={
            isMultiOrgRole
              ? `Network · ${organizations.length} org${organizations.length === 1 ? "" : "s"}`
              : primaryOrg
                ? `${primaryOrg.city}${primaryOrg.region ? ` · ${primaryOrg.region}` : ""}`
                : "—"
          }
        />

        {/* Return path for network/platform admins visiting via the /apf
            "Coordinator view" bridge — org_admins have no /apf to go back to. */}
        {isMultiOrgRole && (
          <Link href="/apf" style={{ textDecoration: "none" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 12px",
                margin: "8px 0 4px",
                borderRadius: 10,
                background: "var(--card)",
                border: "0.5px solid var(--line)",
                color: "var(--ink-2)",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              <ArrowLeft size={13} style={{ color: "var(--terra)" }} />
              Network view
            </div>
          </Link>
        )}

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
        <AdminNavigation openCount={overview?.unfilled_count ?? 0} />

        <div style={{ flex: 1 }} />

        {/* Own phone + SMS preference (finding #3) */}
        {myProfile ? <AdminProfileCard initial={myProfile} /> : null}

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
          <AdminBreadcrumb />
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {viaGrant ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "3px 9px",
                  borderRadius: 999,
                  background: "var(--sand-soft, rgba(232,201,122,.2))",
                  color: "#8C6B14",
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: ".04em",
                }}
              >
                Read-only · access grant
              </span>
            ) : null}
            <Search size={17} strokeWidth={1.7} color="var(--ink-3)" aria-label="Search" />
            <Bell size={17} strokeWidth={1.7} color="var(--ink-3)" aria-label="Notifications" />
            {CLERK_ENABLED ? (
              <HeaderSignOutButton />
            ) : (
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 999,
                  background: "var(--ink)",
                  color: "var(--paper)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <UserIcon size={15} strokeWidth={1.8} />
              </span>
            )}
          </div>
        </div>
        <div style={{ flex: 1, padding: "32px 32px 64px", maxWidth: 1280, width: "100%" }}>
          <ReadOnlyVisitProvider readOnly={viaGrant}>{children}</ReadOnlyVisitProvider>
        </div>
      </main>
    </div>
  );
}
