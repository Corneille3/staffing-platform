"use client";

import React, { useEffect } from "react";
import { Inbox, CalendarCheck, Bell, Clock3, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "../../../i18n/navigation";
import { BottomNav } from "../../../components/ui";
import {
  canUseWorkerOverride,
  useWorkerSession,
  WorkerSessionProvider,
} from "../../../lib/worker-session";

function useNavItems() {
  const t = useTranslations("worker.nav");
  return [
    { href: "/worker",               label: t("inbox"),        Icon: Inbox },
    { href: "/worker/schedule",      label: t("schedule"),     Icon: CalendarCheck },
    { href: "/worker/notifications", label: t("alerts"),       Icon: Bell },
    { href: "/worker/availability",  label: t("availability"), Icon: Clock3 },
    { href: "/worker/profile",       label: t("profile"),      Icon: User },
  ];
}

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
  const showWorkerPicker = canUseWorkerOverride();
  const navItems = useNavItems();

  useEffect(() => {
    if (worker && !worker.profile && pathname !== "/worker/onboarding") {
      router.push("/worker/onboarding");
    }
  }, [worker, pathname, router]);

  if (pathname === "/worker/onboarding") {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <Screen>
        <Centered>
          <span style={{ color: "var(--ink-3)", fontSize: 14 }}>Loading…</span>
        </Centered>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <Centered>
          <p style={{ color: "var(--rose)", fontSize: 14 }}>{error}</p>
        </Centered>
      </Screen>
    );
  }

  if (!worker) {
    if (!showWorkerPicker) {
      return (
        <Screen>
          <Centered>
            <div style={{ maxWidth: 380, textAlign: "center", padding: "0 20px" }}>
              <h1 style={{ margin: "0 0 10px", fontSize: 28, fontFamily: "var(--serif)" }}>
                Account not ready
              </h1>
              <p style={{ margin: 0, color: "var(--ink-2)", lineHeight: 1.6, fontSize: 14 }}>
                Your substitute account is not linked yet. Use the invited email address or
                contact the network administrator.
              </p>
            </div>
          </Centered>
        </Screen>
      );
    }

    return (
      <Screen>
        <div style={{ maxWidth: 480, margin: "80px auto", padding: "0 20px" }}>
          <div style={{ fontSize: 10, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 500, marginBottom: 8 }}>
            Local preview
          </div>
          <h1 style={{ margin: "0 0 6px", fontSize: 28, fontFamily: "var(--serif)" }}>
            Choose your <em style={{ fontStyle: "italic" }}>account</em>
          </h1>
          <p style={{ margin: "0 0 28px", color: "var(--ink-2)", lineHeight: 1.6, fontSize: 14 }}>
            Pick which worker you are previewing locally.
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            {workers.length === 0 ? (
              <p style={{ color: "var(--ink-3)", fontSize: 14 }}>No workers exist yet. Seed the database first.</p>
            ) : (
              workers.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => selectWorker(w.id)}
                  style={{
                    border: "0.5px solid var(--line)",
                    borderRadius: 16,
                    padding: "16px 18px",
                    background: "#fff",
                    color: "var(--ink)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "var(--ui)",
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 600 }}>
                    {w.first_name} {w.last_name}
                  </div>
                  <div style={{ marginTop: 3, color: "var(--ink-3)", fontSize: 13 }}>
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
      <main style={{ maxWidth: 560, margin: "0 auto", padding: "16px 16px 96px" }}>
        {children}
      </main>
      <BottomNav items={navItems} />
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", color: "var(--ink)" }}>
      {children}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      {children}
    </div>
  );
}
