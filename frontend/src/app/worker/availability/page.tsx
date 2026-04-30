"use client";

import { useState } from "react";
import { updateAvailability } from "../../../lib/browser-api";
import { availabilityStatusLabel, pickLocale } from "../../../lib/status-labels";
import { useWorkerSession } from "../../../lib/worker-session";

export default function WorkerAvailabilityPage() {
  const { worker, refresh } = useWorkerSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!worker) return null;
  const locale = pickLocale(worker.preferred_language);

  const status = worker.profile?.availability_status || "unknown";
  const statusLabel = availabilityStatusLabel(status, locale);

  async function setStatus(next: "available" | "unavailable") {
    if (!worker) return;
    setBusy(true);
    setError(null);
    try {
      await updateAvailability(worker.id, next);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 28, paddingTop: 16 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 26 }}>Availability</h1>
        <p style={{ margin: "6px 0 0", color: "#496158" }}>
          Toggle whether you can be matched to new requests.
        </p>
      </header>

      <section
        style={{
          background: "#fffdf7",
          borderRadius: 22,
          padding: 22,
          boxShadow: "0 8px 18px rgba(24, 50, 41, 0.08)",
          textAlign: "center",
          display: "grid",
          gap: 18,
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#5d6d66",
            }}
          >
            Current status
          </p>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 30,
              fontWeight: 800,
              color: status === "available" ? "#214639" : "#7a473f",
            }}
          >
            {statusLabel}
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Toggle
            active={status === "available"}
            disabled={busy}
            onClick={() => setStatus("available")}
            tone="primary"
          >
            {availabilityStatusLabel("available", locale)}
          </Toggle>
          <Toggle
            active={status === "unavailable"}
            disabled={busy}
            onClick={() => setStatus("unavailable")}
            tone="muted"
          >
            {availabilityStatusLabel("unavailable", locale)}
          </Toggle>
        </div>

        {error ? <p style={{ margin: 0, color: "#7a3526", fontWeight: 700 }}>{error}</p> : null}
      </section>

      <section
        style={{
          padding: 16,
          borderRadius: 14,
          background: "rgba(255, 253, 247, 0.7)",
          color: "#3d564c",
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        When you are <strong>unavailable</strong>, you will not be matched to new requests. You can
        still see and respond to ones already sent to you.
      </section>
    </div>
  );
}

function Toggle({
  active,
  disabled,
  onClick,
  tone,
  children,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  tone: "primary" | "muted";
  children: React.ReactNode;
}) {
  const palette =
    tone === "primary"
      ? { onBg: "#214639", onColor: "#f7f0df", offBg: "#dbe4dd", offColor: "#214639" }
      : { onBg: "#7a473f", onColor: "#fff7ef", offBg: "#eadfd7", offColor: "#7a473f" };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        border: 0,
        borderRadius: 14,
        padding: "18px 18px",
        background: active ? palette.onBg : palette.offBg,
        color: active ? palette.onColor : palette.offColor,
        fontSize: 16,
        fontWeight: 800,
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}
