"use client";

import { useEffect, useState } from "react";
import { BellRing, Share } from "lucide-react";
import { useTranslations } from "next-intl";
import { fetchPushPublicKey } from "../lib/browser-api";
import {
  currentSubscription,
  disablePush,
  enablePush,
  isIos,
  isPushSupported,
  isStandalone,
} from "../lib/push";
import { Eyebrow, SaveFlash, useSaveFlash } from "./ui";

/** Per-device Web Push opt-in (PWA). Renders nothing when the server has no
 * VAPID keys or the browser can never push (e.g. desktop Safari < 16). On iOS
 * outside the installed app it becomes the add-to-home-screen hint — Safari
 * only exposes PushManager once the app runs standalone. */
export function PushNotificationsCard({ workerId }: { workerId: string }) {
  const t = useTranslations("worker.notifications.push");
  const tCommon = useTranslations("common");
  const flash = useSaveFlash();
  const [serverKey, setServerKey] = useState<string | null>(null);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const key = await fetchPushPublicKey();
        if (!alive) return;
        setServerKey(key);
        if (key && isPushSupported()) {
          const subscription = await currentSubscription();
          if (alive) setOn(!!subscription);
        }
      } catch {
        if (alive) setServerKey("");
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!serverKey) return null;

  const supported = isPushSupported();
  if (!supported && !isIos()) return null;

  // iOS before install (or in-browser): push is unreachable until the app is
  // opened from the home screen.
  if (!supported || (isIos() && !isStandalone())) {
    return (
      <section style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Share size={14} style={{ color: "var(--ink-3)" }} />
          <Eyebrow>{t("iosTitle")}</Eyebrow>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>
          {t("iosBody")}
        </p>
      </section>
    );
  }

  async function toggle() {
    setBusy(true);
    setNotice(null);
    flash.start();
    try {
      if (on) {
        await disablePush(workerId);
        setOn(false);
        flash.succeed();
      } else {
        const result = await enablePush(workerId);
        if (result === "enabled") {
          setOn(true);
          flash.succeed();
        } else {
          flash.fail();
          setNotice(
            result === "denied" ? t("denied")
              : result === "permission_pending" ? t("permissionPending")
                : t("error"),
          );
        }
      }
    } catch {
      flash.fail();
      setNotice(t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={cardStyle}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <BellRing size={14} style={{ color: "var(--ink-3)" }} />
          <Eyebrow>{t("title")}</Eyebrow>
        </div>
        <SaveFlash state={flash.state} savingLabel={tCommon("saving")} savedLabel={tCommon("saved")} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{t("enableLabel")}</div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{t("enableSub")}</div>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-checked={on}
          role="switch"
          style={{
            width: 38,
            height: 22,
            borderRadius: 99,
            border: "none",
            cursor: busy ? "wait" : "pointer",
            background: on ? "var(--moss)" : "var(--paper-2)",
            position: "relative",
            flexShrink: 0,
          }}
        >
          <div style={{
            position: "absolute",
            top: 2,
            left: on ? 18 : 2,
            width: 18,
            height: 18,
            borderRadius: 99,
            background: "#fff",
            boxShadow: "0 1px 2px rgba(0,0,0,.15)",
            transition: "left .15s",
          }} />
        </button>
      </div>
      {notice ? (
        <p style={{ margin: 0, color: "var(--rose)", fontWeight: 600, fontSize: 12 }}>{notice}</p>
      ) : null}
    </section>
  );
}

const cardStyle: React.CSSProperties = {
  background: "var(--card)",
  border: "0.5px solid var(--line)",
  borderRadius: 16,
  padding: "14px 16px",
  display: "grid",
  gap: 10,
};
