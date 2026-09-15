"use client";

import React, { useEffect, useState } from "react";
import { Inbox, CalendarCheck, Bell, Clock3, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "../../../i18n/navigation";
import { BottomNav } from "../../../components/ui";
import {
  canUseWorkerOverride,
  useWorkerSession,
  WorkerSessionProvider,
} from "../../../lib/worker-session";
import { reattachPush, registerServiceWorker } from "../../../lib/push";
import { fetchNotificationFeed } from "../../../lib/browser-api";
import {
  badgeLabel,
  browserStorage,
  countNewAlerts,
  readAlertsSeenAt,
  writeAlertsSeenAt,
} from "../../../lib/alerts-seen";

const ALERTS_PATH = "/worker/notifications";

function useNavItems(alertsBadge: string | null) {
  const t = useTranslations("worker.nav");
  return [
    { href: "/worker",               label: t("inbox"),        Icon: Inbox },
    { href: "/worker/schedule",      label: t("schedule"),     Icon: CalendarCheck },
    { href: ALERTS_PATH,             label: t("alerts"),       Icon: Bell, badge: alertsBadge },
    { href: "/worker/availability",  label: t("availability"), Icon: Clock3 },
    { href: "/worker/profile",       label: t("profile"),      Icon: User },
  ];
}

/** Terra pill on the Alertes tab: notifications created since this device
 * last opened the Alertes page (the feed has no read state — étape 6 of the
 * worker-screens plan). Fetched on mount and whenever the tab comes back to
 * the front; opening the Alertes page moves the marker and clears the pill. */
function useNewAlertsBadge(workerId: string | undefined, pathname: string): string | null {
  const [items, setItems] = useState<{ created_at: string }[]>([]);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const onAlerts = pathname === ALERTS_PATH;

  useEffect(() => {
    if (!workerId) return;
    let alive = true;
    const load = () => {
      if (document.visibilityState === "hidden") return;
      fetchNotificationFeed(workerId)
        .then((feed) => { if (alive) setItems(feed); })
        .catch(() => { /* keep the last count — the pill is a hint, not a record */ });
    };
    load();
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", load);
    };
  }, [workerId]);

  useEffect(() => {
    const storage = browserStorage();
    if (onAlerts) {
      const now = new Date().toISOString();
      writeAlertsSeenAt(storage, now);
      setSeenAt(now);
    } else {
      setSeenAt(readAlertsSeenAt(storage));
    }
  }, [onAlerts]);

  return onAlerts ? null : badgeLabel(countNewAlerts(items, seenAt));
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
  const alertsBadge = useNewAlertsBadge(worker?.id, pathname);
  const navItems = useNavItems(alertsBadge);
  const tShell = useTranslations("worker.shell");
  const tCommon = useTranslations("common");

  useEffect(() => {
    if (worker && !worker.profile && pathname !== "/worker/onboarding") {
      router.push("/worker/onboarding");
    }
  }, [worker, pathname, router]);

  // Keep the push service worker installed/updated for devices that already
  // opted in (the opt-in card registers it on first enable).
  useEffect(() => {
    registerServiceWorker();
  }, []);

  // The push endpoint follows the signed-in account (see reattachPush): on a
  // shared device the subscription otherwise stays with whoever enabled it.
  useEffect(() => {
    if (!worker?.id) return;
    reattachPush(worker.id).catch(() => undefined);
  }, [worker?.id]);

  if (pathname === "/worker/onboarding") {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <Screen>
        <Centered>
          <span style={{ color: "var(--ink-3)", fontSize: 14 }}>{tCommon("loading")}</span>
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
                {tShell("accountNotReady")}
              </h1>
              <p style={{ margin: 0, color: "var(--ink-2)", lineHeight: 1.6, fontSize: 14 }}>
                {tShell("accountNotReadyBody")}
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
            {tShell("localPreview")}
          </div>
          <h1 style={{ margin: "0 0 6px", fontSize: 28, fontFamily: "var(--serif)" }}>
            {tShell("chooseAccount")} <em style={{ fontStyle: "italic" }}>{tShell("chooseAccountAccent")}</em>
          </h1>
          <p style={{ margin: "0 0 28px", color: "var(--ink-2)", lineHeight: 1.6, fontSize: 14 }}>
            {tShell("pickWorker")}
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            {workers.length === 0 ? (
              <p style={{ color: "var(--ink-3)", fontSize: 14 }}>{tShell("noWorkersSeeded")}</p>
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
