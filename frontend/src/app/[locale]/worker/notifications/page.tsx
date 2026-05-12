"use client";

import { useEffect, useState } from "react";
import { Calendar } from "lucide-react";
import { fetchNotificationFeed } from "../../../../lib/browser-api";
import { pickLocale } from "../../../../lib/status-labels";
import { NotificationFeedItem } from "../../../../lib/types";
import { useWorkerSession } from "../../../../lib/worker-session";
import { Eyebrow, Mono } from "../../../../components/ui";

type NotifType = NotificationFeedItem["type"];

const TYPE_ORDER: NotifType[] = ["urgent", "assigned", "not_selected", "cancelled", "new_request"];

const COPY: Record<NotifType, {
  en: { label: string; body: (t: string, c: string) => string };
  fr: { label: string; body: (t: string, c: string) => string };
}> = {
  urgent: {
    en: { label: "Urgent",        body: (t, c) => `Urgent coverage needed: ${t} in ${c}` },
    fr: { label: "Urgent",        body: (t, c) => `Remplacement urgent : ${t} à ${c}` },
  },
  new_request: {
    en: { label: "New request",   body: (t, c) => `New coverage request: ${t} in ${c}` },
    fr: { label: "Nouvelle demande", body: (t, c) => `Nouvelle demande de remplacement : ${t} à ${c}` },
  },
  assigned: {
    en: { label: "Confirmed",     body: (t, c) => `You've been confirmed for ${t} in ${c}` },
    fr: { label: "Confirmée",     body: (t, c) => `Vous êtes confirmé·e pour ${t} à ${c}` },
  },
  not_selected: {
    en: { label: "Not selected",  body: (t, c) => `Another substitute was chosen for ${t} in ${c}` },
    fr: { label: "Non retenu·e",  body: (t, c) => `Un·e autre remplaçant·e a été choisi·e pour ${t} à ${c}` },
  },
  cancelled: {
    en: { label: "Cancelled",     body: (t, c) => `Your assignment for ${t} in ${c} was cancelled` },
    fr: { label: "Annulée",       body: (t, c) => `Votre affectation pour ${t} à ${c} a été annulée` },
  },
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
        <Eyebrow style={{ marginBottom: 4 }}>
          {items.length === 0 && !loading
            ? (locale === "fr" ? "Aucune alerte" : "No alerts")
            : `${items.length} notification${items.length === 1 ? "" : "s"}`}
        </Eyebrow>
        <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 30, lineHeight: 1.05 }}>
          {locale === "fr"
            ? <>Vos <em style={{ fontStyle: "italic" }}>alertes</em></>
            : <>Your <em style={{ fontStyle: "italic" }}>alerts</em></>}
        </h1>
      </header>

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
        <p style={{ color: "var(--ink-3)", fontSize: 14 }}>Loading…</p>
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
          {locale === "fr"
            ? "Aucune notification. Elles apparaissent ici une fois que vous êtes mis en correspondance avec une demande."
            : "No notifications yet. They appear here once you're matched to a coverage request."}
        </div>
      ) : (
        grouped.map(({ type, items: group }) => {
          const copy = COPY[type][locale];
          const tone = TONE[type];
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
                <Eyebrow>{copy.label} ({group.length})</Eyebrow>
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
                      {copy.body(item.request_title, item.request_city)}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink-3)", fontSize: 12 }}>
                      <Calendar size={12} />
                      <span>{item.request_date}</span>
                      <span style={{ margin: "0 2px" }}>·</span>
                      <Mono style={{ fontSize: 11 }}>{formatRelative(item.created_at)}</Mono>
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
