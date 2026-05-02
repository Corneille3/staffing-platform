"use client";

import { useState } from "react";
import { updateAvailability, updateWorkerPreferences } from "../../../lib/browser-api";
import { availabilityStatusLabel, pickLocale } from "../../../lib/status-labels";
import { useWorkerSession } from "../../../lib/worker-session";

export default function WorkerAvailabilityPage() {
  const { worker, refresh } = useWorkerSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cityInput, setCityInput] = useState("");
  const [cityBusy, setCityBusy] = useState(false);
  const [cityError, setCityError] = useState<string | null>(null);

  if (!worker) return null;
  const locale = pickLocale(worker.preferred_language);

  const status = worker.profile?.availability_status || "unknown";
  const statusLabel = availabilityStatusLabel(status, locale);
  const cities: string[] = worker.profile?.supported_cities ?? [];

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

  async function saveCities(next: string[]) {
    if (!worker) return;
    setCityBusy(true);
    setCityError(null);
    try {
      await updateWorkerPreferences(worker.id, { supported_cities: next });
      await refresh();
    } catch (err) {
      setCityError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setCityBusy(false);
    }
  }

  function addCity() {
    const trimmed = cityInput.trim();
    if (!trimmed || cities.includes(trimmed)) { setCityInput(""); return; }
    saveCities([...cities, trimmed]);
    setCityInput("");
  }

  function removeCity(city: string) {
    saveCities(cities.filter((c) => c !== city));
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

      <section
        style={{
          background: "#fffdf7",
          borderRadius: 22,
          padding: 22,
          boxShadow: "0 8px 18px rgba(24, 50, 41, 0.08)",
          display: "grid",
          gap: 18,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Preferred cities</h2>
          <p style={{ margin: "6px 0 0", color: "#496158", fontSize: 14 }}>
            Only requests in these cities will be matched to you.
          </p>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {cities.length === 0 ? (
            <span style={{ color: "#5d6d66", fontSize: 14 }}>No cities added yet.</span>
          ) : (
            cities.map((city) => (
              <span
                key={city}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  borderRadius: 999,
                  padding: "8px 14px",
                  background: "#e2ebdd",
                  color: "#214639",
                  fontWeight: 800,
                  fontSize: 14,
                }}
              >
                {city}
                <button
                  type="button"
                  aria-label={`Remove ${city}`}
                  disabled={cityBusy}
                  onClick={() => removeCity(city)}
                  style={{
                    border: 0,
                    background: "none",
                    color: "#496158",
                    cursor: cityBusy ? "wait" : "pointer",
                    padding: 0,
                    fontSize: 16,
                    lineHeight: 1,
                    fontWeight: 800,
                  }}
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <input
            type="text"
            value={cityInput}
            placeholder="Add a city…"
            onChange={(e) => setCityInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCity(); } }}
            disabled={cityBusy}
            style={{
              flex: 1,
              border: "1px solid rgba(24, 50, 41, 0.18)",
              borderRadius: 12,
              padding: "12px 14px",
              fontSize: 15,
              background: "#fff",
              color: "#183229",
              font: "inherit",
            }}
          />
          <button
            type="button"
            disabled={cityBusy || !cityInput.trim()}
            onClick={addCity}
            style={{
              border: 0,
              borderRadius: 12,
              padding: "12px 18px",
              background: "#214639",
              color: "#f7f0df",
              fontWeight: 800,
              fontSize: 15,
              cursor: cityBusy || !cityInput.trim() ? "default" : "pointer",
              opacity: cityBusy || !cityInput.trim() ? 0.5 : 1,
            }}
          >
            Add
          </button>
        </div>

        {cityError ? (
          <p style={{ margin: 0, color: "#7a3526", fontWeight: 700, fontSize: 14 }}>{cityError}</p>
        ) : null}
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
