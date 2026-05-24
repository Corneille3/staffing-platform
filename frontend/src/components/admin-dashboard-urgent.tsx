"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Mono } from "./ui";
import { assignWorker } from "../lib/browser-api";
import type { AdminDashboardUrgent } from "../lib/types";

const ROLE_LABEL: Record<string, string> = {
  educator: "Educator",
  assistant_educator: "Assistant educator",
  psw: "PSW",
  nurse: "Nurse",
  food_handler: "Food handler",
  other: "Staff",
};

function duration(start: string, end: string): string {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h${m}` : `${h}h`;
}

export function AdminDashboardUrgentCard({
  urgent,
  siteName,
}: {
  urgent: AdminDashboardUrgent;
  siteName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function assign() {
    if (!urgent.top_match) return;
    setBusy(true);
    setError(null);
    try {
      await assignWorker(urgent.id, urgent.top_match.user_id);
      setDone(true);
      // Surface the next-most-urgent (or the all-clear state).
      setTimeout(() => router.refresh(), 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assign failed — someone may have grabbed it.");
      setBusy(false);
    }
  }

  const role = urgent.role ? ROLE_LABEL[urgent.role] ?? urgent.role : "Staff";
  const stats = [
    { label: "Responded", value: `${urgent.metrics.responses}` },
    { label: "Accepted", value: `${urgent.metrics.accepted}` },
    { label: "Time elapsed", value: urgent.elapsed.replace(" ago", "") },
    { label: "Shift starts", value: urgent.starts_in.replace("in ", "") },
  ];

  return (
    <div
      style={{
        background: "var(--ink)",
        color: "var(--paper)",
        borderRadius: "var(--r-md)",
        padding: 22,
        marginBottom: 22,
        borderLeft: "3px solid var(--terra)",
        opacity: done ? 0.85 : 1,
        transition: "opacity .3s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: done ? "#A8D9B8" : "var(--terra)", fontWeight: 600 }}>
          {done ? "Assigned" : "Urgent now"}
        </span>
        <Mono style={{ fontSize: 11, color: "rgba(246,244,238,.5)" }}>{urgent.public_id}</Mono>
      </div>

      <h2 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 24, fontWeight: 400 }}>
        {urgent.title}{" "}
        <em style={{ fontStyle: "italic", color: "rgba(246,244,238,.75)", fontSize: 19 }}>
          {urgent.start_time.slice(0, 5)}→{urgent.end_time.slice(0, 5)}
        </em>
      </h2>
      <div style={{ fontSize: 13, color: "rgba(246,244,238,.7)", marginTop: 4 }}>
        {role} · {siteName} · {duration(urgent.start_time, urgent.end_time)} · {urgent.work_date}
      </div>

      {done ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, color: "#A8D9B8", fontSize: 14, fontWeight: 600 }}>
          <CheckCircle2 size={18} /> Assigned to {urgent.top_match?.name}. Refreshing…
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            {urgent.top_match && (
              <button
                onClick={assign}
                disabled={busy}
                style={{
                  padding: "10px 18px",
                  borderRadius: 12,
                  border: "none",
                  background: "var(--terra)",
                  color: "#fff",
                  fontFamily: "var(--ui)",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: busy ? "wait" : "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy ? "Assigning…" : `Assign top match${urgent.top_match.match_score != null ? ` · ${urgent.top_match.match_score}%` : ""}`}
              </button>
            )}
            <Link
              href={`/admin/requests/${urgent.id}`}
              style={{
                padding: "10px 18px",
                borderRadius: 12,
                border: "0.5px solid rgba(246,244,238,.25)",
                background: "transparent",
                color: "var(--paper)",
                fontFamily: "var(--ui)",
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              See all {urgent.metrics.responses} responses
            </Link>
          </div>
          {error && <p style={{ color: "#F2B5A8", fontSize: 13, fontWeight: 600, marginTop: 10, marginBottom: 0 }}>{error}</p>}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, marginTop: 18, background: "rgba(246,244,238,.12)", borderRadius: 12, overflow: "hidden" }}>
            {stats.map((s) => (
              <div key={s.label} style={{ background: "var(--ink)", padding: "12px 14px" }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", color: "rgba(246,244,238,.5)" }}>{s.label}</div>
                <Mono style={{ fontSize: 18, fontWeight: 600, color: "var(--paper)" }}>{s.value}</Mono>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
