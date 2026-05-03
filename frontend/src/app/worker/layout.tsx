"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect } from "react";
import { useWorkerSession, WorkerSessionProvider } from "../../lib/worker-session";

export default function WorkerLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkerSessionProvider>
      <WorkerShell>{children}</WorkerShell>
    </WorkerSessionProvider>
  );
}

function WorkerShell({ children }: { children: React.ReactNode }) {
  const { worker, workers, loading, error, selectWorker } = useWorkerSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (worker && !worker.profile && pathname !== "/worker/onboarding") {
      router.push("/worker/onboarding");
    }
  }, [worker, pathname, router]);

  // Onboarding is a standalone full-screen page — skip the shell entirely
  if (pathname === "/worker/onboarding") {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <Screen>
        <Centered>Loading…</Centered>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <Centered>
          <p style={{ color: "#ffb1a0" }}>{error}</p>
        </Centered>
      </Screen>
    );
  }

  if (!worker) {
    return (
      <Screen>
        <div style={{ maxWidth: 480, margin: "60px auto", padding: "0 20px" }}>
          <p
            style={{
              fontSize: 12,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              opacity: 0.7,
            }}
          >
            Welcome
          </p>
          <h1 style={{ margin: "8px 0 6px", fontSize: 32 }}>Choose your account</h1>
          <p style={{ margin: 0, opacity: 0.78, lineHeight: 1.5 }}>
            Pick which worker you are signing in as. (Real authentication coming soon.)
          </p>
          <div style={{ display: "grid", gap: 12, marginTop: 28 }}>
            {workers.length === 0 ? (
              <p style={{ opacity: 0.7 }}>No workers exist yet. Seed the database first.</p>
            ) : (
              workers.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => selectWorker(w.id)}
                  style={{
                    border: 0,
                    borderRadius: 18,
                    padding: "18px 20px",
                    background: "#fffdf7",
                    color: "#183229",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 16,
                    fontWeight: 600,
                    boxShadow: "0 12px 28px rgba(0,0,0,0.18)",
                  }}
                >
                  <div style={{ fontSize: 18 }}>
                    {w.first_name} {w.last_name}
                  </div>
                  <div style={{ marginTop: 4, color: "#5d6d66", fontSize: 13, fontWeight: 500 }}>
                    {w.email}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <WorkerHeader workerName={`${worker.first_name} ${worker.last_name}`} />
      <main style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px 110px" }}>{children}</main>
      <WorkerBottomNav />
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f7f0df 0%, #ebe5d8 100%)",
        color: "#183229",
      }}
    >
      {children}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
    >
      {children}
    </div>
  );
}

function WorkerHeader({ workerName }: { workerName: string }) {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: "rgba(247, 240, 223, 0.86)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(24, 50, 41, 0.08)",
        padding: "14px 20px",
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <p
          style={{
            margin: 0,
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#496158",
          }}
        >
          Signed in as
        </p>
        <strong style={{ display: "block", marginTop: 2, fontSize: 18 }}>{workerName}</strong>
      </div>
    </header>
  );
}

const NAV_LINKS = [
  { href: "/worker", label: "Home", icon: "⌂" },
  { href: "/worker/requests", label: "Requests", icon: "◈" },
  { href: "/worker/assignments", label: "Shifts", icon: "✓" },
  { href: "/worker/notifications", label: "Alerts", icon: "🔔" },
  { href: "/worker/availability", label: "Availability", icon: "○" },
  { href: "/worker/profile", label: "Profile", icon: "☉" },
];

function WorkerBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        background: "rgba(24, 50, 41, 0.96)",
        borderTop: "1px solid rgba(247, 240, 223, 0.1)",
        padding: "8px 8px 14px",
      }}
    >
      <div
        style={{
          maxWidth: 560,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: `repeat(${NAV_LINKS.length}, 1fr)`,
          gap: 4,
        }}
      >
        {NAV_LINKS.map((link) => {
          const active =
            pathname === link.href || (link.href !== "/worker" && pathname.startsWith(link.href));
          return (
            <Link
              key={link.href}
              href={link.href}
              style={{
                textDecoration: "none",
                textAlign: "center",
                padding: "10px 4px",
                borderRadius: 12,
                color: active ? "#f7f0df" : "rgba(247, 240, 223, 0.6)",
                background: active ? "rgba(247, 240, 223, 0.12)" : "transparent",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              <div style={{ fontSize: 18, marginBottom: 4 }}>{link.icon}</div>
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
