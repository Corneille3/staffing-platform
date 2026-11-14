import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ClipboardList, Eye } from "lucide-react";
import { ApfNavigation } from "../../../components/apf-navigation";
import { HeaderSignOutButton } from "../../../components/header-sign-out-button";
import { ReadOnlyVisitProvider } from "../../../components/read-only-visit";
import { Eyebrow } from "../../../components/ui";
import { WorkspaceSuspendedScreen } from "../../../components/workspace-suspended";
import { ApiError, getOrganizations, getTenantProfile, requireServerSession } from "../../../lib/api";
import type { TenantProfile } from "../../../lib/types";

const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default async function ApfLayout({ children }: { children: React.ReactNode }) {
  let isPlatformAdmin = false;
  if (CLERK_ENABLED) {
    const session = await requireServerSession(["network_admin", "platform_admin"]);
    isPlatformAdmin = session.role === "platform_admin";
    // A marketing operator owns the sales pipeline only — the API refuses
    // every workspace call, which would otherwise read as "suspended" below.
    if (session.platform_operator_role === "marketing") redirect("/platform/leads");
  }

  // The caller's own tenant — names the workspace in the sidebar. A 403 here
  // means the tenant is suspended (scope rejects every tenant-scoped call).
  let tenant: TenantProfile | null = null;
  let suspended = false;
  try {
    tenant = await getTenantProfile();
  } catch (err) {
    suspended = err instanceof ApiError && err.status === 403;
  }

  if (CLERK_ENABLED && suspended) {
    return <WorkspaceSuspendedScreen />;
  }
  // A platform operator with no workspace in scope (no membership, no active
  // grant — including a tenant suspended out of scope): back to the console.
  if (CLERK_ENABLED && isPlatformAdmin && tenant === null) {
    redirect("/platform");
  }
  // Non-platform admin whose tenant hasn't finished onboarding → the setup
  // wizard (MULTITENANCY_HANDOFF §6).
  if (CLERK_ENABLED && !isPlatformAdmin && tenant && tenant.status !== "active") {
    redirect("/welcome");
  }

  let orgCount: number | null = null;
  try {
    const orgs = await getOrganizations();
    orgCount = orgs.length;
  } catch {
    orgCount = null;
  }

  const networkName = tenant?.name ?? "Your network";

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
            Network
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
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--paper)" }}>{networkName}</div>
          <div style={{ fontSize: 11, color: "rgba(246, 244, 238, 0.5)" }}>
            {tenant?.slug ? `${tenant.slug} · ` : ""}
            {orgCount != null ? `${orgCount} ${orgCount === 1 ? "organization" : "organizations"}` : "—"}
          </div>
          {tenant?.via_grant ? (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                alignSelf: "flex-start",
                marginTop: 4,
                padding: "3px 8px",
                borderRadius: 999,
                background: "rgba(232, 201, 122, 0.16)",
                color: "var(--sand)",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: ".04em",
              }}
            >
              <Eye size={11} /> Read-only · access grant
            </div>
          ) : null}
        </div>

        <Eyebrow style={{ color: "rgba(246, 244, 238, 0.5)", padding: "0 12px 8px" }}>Workspace</Eyebrow>
        <ApfNavigation />

        <div style={{ flex: 1 }} />

        {isPlatformAdmin ? (
          <>
            {/* Support work happens through the coordinator lens (same
                tenant data, same read-only enforcement on a grant visit) —
                the SaaS side fixes app issues, not the tenant admin. */}
            <Link href="/admin" style={{ textDecoration: "none" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 12px",
                  marginBottom: 8,
                  borderRadius: 10,
                  background: "rgba(246, 244, 238, 0.04)",
                  border: "0.5px solid rgba(246, 244, 238, 0.12)",
                  color: "rgba(246, 244, 238, 0.75)",
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                <ClipboardList size={13} style={{ color: "var(--terra)" }} />
                Coordinator view
                {tenant?.via_grant ? (
                  <span style={{ marginLeft: "auto", fontSize: 9.5, color: "rgba(246,244,238,.45)" }}>
                    read-only
                  </span>
                ) : null}
              </div>
            </Link>
            <Link href="/platform" style={{ textDecoration: "none" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 12px",
                  marginBottom: 8,
                  borderRadius: 10,
                  background: "rgba(246, 244, 238, 0.04)",
                  border: "0.5px solid rgba(246, 244, 238, 0.12)",
                  color: "rgba(246, 244, 238, 0.75)",
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                <ArrowLeft size={13} style={{ color: "var(--terra)" }} />
                Platform console
              </div>
            </Link>
          </>
        ) : null}

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
          Your workspace — manage your sites, coordinators, and substitutes.
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
          <Eyebrow>{tenant?.via_grant ? "Support access · read-only" : "Your Network"}</Eyebrow>
          {CLERK_ENABLED ? <HeaderSignOutButton /> : null}
        </div>
        <div style={{ flex: 1, padding: "32px 32px 64px", maxWidth: 1280, width: "100%" }}>
          <ReadOnlyVisitProvider readOnly={tenant?.via_grant === true}>{children}</ReadOnlyVisitProvider>
        </div>
      </main>
    </div>
  );
}
