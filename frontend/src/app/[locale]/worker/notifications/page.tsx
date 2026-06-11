"use client";

import { useEffect, useState } from "react";
import { Calendar } from "lucide-react";
import { useTranslations } from "next-intl";
import { fetchNotificationFeed } from "../../../../lib/browser-api";
import { NotificationFeedItem } from "../../../../lib/types";
import { useWorkerSession } from "../../../../lib/worker-session";
import { Eyebrow, Mono } from "../../../../components/ui";
import { PushNotificationsCard } from "../../../../components/push-notifications-card";

type NotifType = NotificationFeedItem["type"];

const TYPE_ORDER: NotifType[] = ["urgent", "assigned", "not_selected", "cancelled", "new_request"];

const LABEL_KEY: Record<NotifType, string> = {
  urgent: "urgent",
  new_request: "newRequest",
  assigned: "assigned",
  not_selected: "notSelected",
  cancelled: "cancelled",
};

const TONE: Record<NotifType, { bg: string; color: string; dotColor: string }> = {
  urgent:       { bg: "var(--rose-soft)",  color: "var(--rose)",      dotColor: "var(--rose)" },
  new_request:  { bg: "var(--terra-soft)", color: "var(--terra-ink)", dotColor: "var(--terra)" },
  assigned:     { bg: "var(--moss-soft)",  color: "var(--moss)",      dotColor: "var(--moss)" },
  not_selected: { bg: "var(--paper-2)",    color: "var(--ink-2)",     dotColor: "var(--ink-4)" },
  cancelled:    { bg: "var(--sand-soft)",  color: "#8C6B14",          dotColor: "var(--sand)" },
};

export default function WorkerNotificationsPage() {
  const { worker } = useWorkerSession();
  const t = useTranslations("worker.notifications");
  const tCommon = useTranslations("common");
  const tTime = useTranslations("time");
  const [items, setItems] = useState<NotificationFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!worker) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const feed = await fetchNotificationFeed(worker.id);
        if (alive) setItems(feed);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [worker]);

  if (!worker) return null;

  const grouped = TYPE_ORDER.map((type) => ({
    type,
    items: items.filter((item) => item.type === type),
  })).filter((g) => g.items.length > 0);

  return (
    <div style={{ display: "grid", gap: 24, paddingTop: 16 }}>
      <header>
        <Eyebrow style={{ marginBottom: 4 }}>
          {items.length === 0 && !loading
            ? t("noAlerts")
            : items.length === 1
              ? t("countOne", { n: items.length })
              : t("countOther", { n: items.length })}
        </Eyebrow>
        <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 30, lineHeight: 1.05 }}>
          {t("headlinePre")} <em style={{ fontStyle: "italic" }}>{t("headlineAccent")}</em>
        </h1>
      </header>

      <PushNotificationsCard workerId={worker.id} />

      {error ? (
        <div style={{
          padding: "12px 16px",
          borderRadius: 12,
          background: "var(--rose-soft)",
          color: "var(--rose)",
          fontWeight: 600,
          fontSize: 13,
        }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <p style={{ color: "var(--ink-3)", fontSize: 14 }}>{tCommon("loading")}</p>
      ) : grouped.length === 0 ? (
        <div style={{
          padding: 24,
          borderRadius: 18,
          background: "var(--card)",
          border: "0.5px dashed var(--line)",
          color: "var(--ink-3)",
          textAlign: "center",
          fontSize: 14,
          lineHeight: 1.5,
        }}>
          {t("emptyState")}
        </div>
      ) : (
        grouped.map(({ type, items: group }) => {
          const tone = TONE[type];
          const labelKey = LABEL_KEY[type];
          return (
            <section key={type}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: 99,
                  background: tone.dotColor,
                  display: "inline-block",
                  flexShrink: 0,
                }} />
                <Eyebrow>{t(`labels.${labelKey}`)} ({group.length})</Eyebrow>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {group.map((item) => (
                  <article
                    key={item.id}
                    style={{
                      background: tone.bg,
                      borderRadius: 16,
                      padding: "14px 16px",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <p style={{ margin: 0, color: tone.color, fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>
                      {t(`bodies.${labelKey}`, { title: item.request_title, city: item.request_city })}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink-3)", fontSize: 12 }}>
                      <Calendar size={12} />
                      <span>{item.request_date}</span>
                      <span style={{ margin: "0 2px" }}>·</span>
                      <Mono style={{ fontSize: 11 }}>{formatRelative(item.created_at, tTime)}</Mono>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

function formatRelative(iso: string, tTime: ReturnType<typeof useTranslations>): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return tTime("justNow");
  if (minutes < 60) return tTime("minutesAgo", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return tTime("hoursAgo", { n: hours });
  const days = Math.floor(hours / 24);
  return tTime("daysAgo", { n: days });
}
