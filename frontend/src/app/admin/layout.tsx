import React from "react";
import { AdminNavigation } from "../../components/admin-navigation";
import { HeaderSignOutButton } from "../../components/header-sign-out-button";
import { requireServerSession } from "../../lib/api";

const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (CLERK_ENABLED) {
    await requireServerSession(["org_admin", "network_admin", "platform_admin"]);
  }
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, #f4efe2 0%, #ebe5d8 24%, #d8d7cb 52%, #bcc9c2 100%)",
      }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          backdropFilter: "blur(14px)",
          background: "rgba(244, 239, 226, 0.78)",
          borderBottom: "1px solid rgba(24, 50, 41, 0.1)",
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "18px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 20,
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              STAFFIG PLATFORM
            </p>
            <strong style={{ display: "block", marginTop: 4, fontSize: 20 }}>
              Operations Console
            </strong>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <AdminNavigation />
            {CLERK_ENABLED ? <HeaderSignOutButton /> : null}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
