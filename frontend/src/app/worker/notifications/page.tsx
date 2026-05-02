"use client";

import { useEffect, useState } from "react";
import { fetchNotificationFeed } from "../../../lib/browser-api";
import { pickLocale } from "../../../lib/status-labels";
import { NotificationFeedItem } from "../../../lib/types";
import { useWorkerSession } from "../../../lib/worker-session";

type NotifType = NotificationFeedItem["type"];

const TYPE_ORDER: NotifType[] = ["urgent", "assigned", "not_selected", "cancelled", "new_request"];

const COPY: Record<NotifType, { en: { label: string; icon: string; body: (t: string, c: string) => string }; fr: { label: string; icon: string; body: (t: string, c: string) => string } }> = {
  urgent: {
    en: { label: "Urgent", icon: "🚨", body: (t, c) => `Urgent coverage needed: ${t} in ${c}` },
    fr: { label: "Urgent", icon: "🚨", body: (t, c) => `Remplacement urgent : ${t} à ${c}` },
  },
  new_request: {
    en: { label: "New request", icon: "🔔", body: (t, c) => `New coverage request: ${t} in ${c}` },
    fr: { label: "Nouvelle demande", icon: "🔔", body: (t, c) => `Nouvelle demande de remplacement : ${t} à ${c}` },
  },
  assigned: {
    en: { label: "Confirmed", icon: "✅", body: (t, c) => `You've been confirmed for ${t} in ${c}` },
    fr: { label: "Confirmée", icon: "✅", body: (t, c) => `Vous êtes confirmé·e pour ${t} à ${c}` },
  },
  not_selected: {
    en: { label: "Not selected", icon: "⚪", body: (t, c) => `Another substitute was chosen for ${t} in ${c}` },
    fr: { label: "Non retenu·e", icon: "⚪", body: (t, c) => `Un·e autre remplaçant·e a été choisi·e pour ${t} à ${c}` },
  },
  cancelled: {
    en: { label: "Cancelled", icon: "❌", body: (t, c) => `Your assignment for ${t} in ${c} was cancelled` },
    fr: { label: "Annulée", icon: "❌", body: (t, c) => `Votre affectation pour ${t} à ${c} a été annulée` },
  },
};

const TONE: Record<NotifType, { bg: string; color: string; badge: string; badgeText: string }> = {
  urgent:      { bg: "#fff3f0", color: "#7a3526", badge: "#f4d4cc", badgeText: "#7a3526" },
  new_request: { bg: "#fffdf7", color: "#183229", badge: "#e2ebdd", badgeText: "#214639" },
  assigned:    { bg: "#edf7f0", color: "#214639", badge: "#d2ead8", badgeText: "#214639" },
  not_selected:{ bg: "#f5f5f3", color: "#5d6d66", badge: "#e8e8e5", badgeText: "#5d6d66" },
  cancelled:   { bg: "#faf5f0", color: "#7a473f", badge: "#eadfd7", badgeText: "#7a473f" },
};

export default function WorkerNotificationsPage() {
  const { worker } = useWorkerSession();
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
  const locale = pickLocale(worker.preferred_language);

  const grouped = TYPE_ORDER.map((type) => ({
    type,
    items: items.filter((item) => item.type === type),
  })).filter((g) => g.items.length > 0);

  return (
    <div style={{ display: "grid", gap: 24, paddingTop: 16 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 26 }}>Notifications</h1>
        <p style={{ margin: "6px 0 0", color: "#496158" }}>
          {items.length === 0 && !loading ? "Nothing yet." : `${items.length} notification${items.length === 1 ? "" : "s"}`}
        </p>
      </header>

      {error ? (
        <div style={{ padding: 14, borderRadius: 12, background: "#f4d4cc", color: "#7a3526", fontWeight: 700, fontSize: 14 }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <p style={{ color: "#496158" }}>Loading…</p>
      ) : grouped.length === 0 ? (
        <div
          style={{
            padding: 24,
            borderRadius: 18,
            background: "rgba(255, 253, 247, 0.7)",
            border: "1px dashed rgba(24, 50, 41, 0.18)",
            color: "#5d6d66",
            textAlign: "center",
            fontSize: 14,
          }}
        >
          No notifications yet. They appear here once you're matched to a coverage request.
        </div>
      ) : (
        grouped.map(({ type, items: group }) => {
          const copy = COPY[type][locale];
          const tone = TONE[type];
          return (
            <section key={type}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 16 }}>{copy.icon}</span>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 13,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "#496158",
                  }}
                >
                  {copy.label} ({group.length})
                </h2>
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {group.map((item) => (
                  <article
                    key={item.id}
                    style={{
                      background: tone.bg,
                      borderRadius: 18,
                      padding: 16,
                      display: "grid",
                      gap: 8,
                      boxShadow: "0 4px 12px rgba(24, 50, 41, 0.06)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                      <p style={{ margin: 0, color: tone.color, fontSize: 15, fontWeight: 700, lineHeight: 1.4 }}>
                        {copy.body(item.request_title, item.request_city)}
                      </p>
                      <span
                        style={{
                          flexShrink: 0,
                          borderRadius: 999,
                          padding: "4px 10px",
                          background: tone.badge,
                          color: tone.badgeText,
                          fontSize: 11,
                          fontWeight: 800,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {copy.label}
                      </span>
                    </div>
                    <p style={{ margin: 0, color: "#5d6d66", fontSize: 13 }}>
                      📅 {item.request_date} · {formatRelative(item.created_at)}
                    </p>
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

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
