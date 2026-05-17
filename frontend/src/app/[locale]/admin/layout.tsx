import React from "react";
import { AdminNavigation } from "../../../components/admin-navigation";
import { HeaderSignOutButton } from "../../../components/header-sign-out-button";
import { Eyebrow } from "../../../components/ui";
import { requireServerSession } from "../../../lib/api";

const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (CLERK_ENABLED) {
    await requireServerSession(["org_admin", "network_admin", "platform_admin"]);
  }
  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", color: "var(--ink)" }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--paper)",
          borderBottom: "0.5px solid var(--line)",
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "18px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <div>
            <Eyebrow style={{ marginBottom: 4 }}>Staffig Platform</Eyebrow>
            <h1
              style={{
                margin: 0,
                fontFamily: "var(--serif)",
                fontSize: 24,
                lineHeight: 1.05,
                fontWeight: 400,
              }}
            >
              Operations <em style={{ fontStyle: "italic" }}>Console</em>
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <AdminNavigation />
            {CLERK_ENABLED ? <HeaderSignOutButton /> : null}
          </div>
        </div>
      </header>
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px 64px" }}>
        {children}
      </main>
    </div>
  );
}
