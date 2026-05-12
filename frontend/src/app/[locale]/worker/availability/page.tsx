"use client";

import { useState } from "react";
import { MapPin, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { updateAvailability, updateWorkerPreferences } from "../../../../lib/browser-api";
import { useWorkerSession } from "../../../../lib/worker-session";
import { Eyebrow } from "../../../../components/ui";

export default function WorkerAvailabilityPage() {
  const { worker, refresh } = useWorkerSession();
  const t = useTranslations("worker.availability");
  const tCommon = useTranslations("common");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cityInput, setCityInput] = useState("");
  const [cityBusy, setCityBusy] = useState(false);
  const [cityError, setCityError] = useState<string | null>(null);

  if (!worker) return null;

  const status = worker.profile?.availability_status || "unknown";
  const cities: string[] = worker.profile?.supported_cities ?? [];
  const urgentAlertsOn = worker.profile?.urgent_alert_opt_in ?? false;
  const notifyFarOn = worker.profile?.notify_far ?? false;
  const notifyWeekendOvernightOn = worker.profile?.notify_weekend_overnight ?? false;

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

  async function toggleUrgentAlerts() {
    if (!worker) return;
    setBusy(true);
    try {
      await updateWorkerPreferences(worker.id, { urgent_alert_opt_in: !urgentAlertsOn });
      await refresh();
    } catch {
      // silent
    } finally {
      setBusy(false);
    }
  }

  async function toggleNotifyFar() {
    if (!worker) return;
    setBusy(true);
    try {
      await updateWorkerPreferences(worker.id, { notify_far: !notifyFarOn });
      await refresh();
    } catch {
      // silent
    } finally {
      setBusy(false);
    }
  }

  async function toggleNotifyWeekendOvernight() {
    if (!worker) return;
    setBusy(true);
    try {
      await updateWorkerPreferences(worker.id, { notify_weekend_overnight: !notifyWeekendOvernightOn });
      await refresh();
    } catch {
      // silent
    } finally {
      setBusy(false);
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

  const statusLabel = status === "available" ? t("available") : status === "unavailable" ? t("unavailable") : "—";

  return (
    <div style={{ display: "grid", gap: 24, paddingTop: 16 }}>
      <header>
        <Eyebrow style={{ marginBottom: 4 }}>{t("eyebrow")}</Eyebrow>
        <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 30, lineHeight: 1.05 }}>
          {t("headlinePre")} <em style={{ fontStyle: "italic" }}>{t("headlineAccent")}</em>
        </h1>
      </header>

      {/* status summary strip */}
      <div style={{
        padding: "14px 16px",
        background: "var(--card)",
        border: "0.5px solid var(--line)",
        borderRadius: 16,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}>
        <div style={{ flex: 1 }}>
          <Eyebrow style={{ marginBottom: 4 }}>{t("currentStatus")}</Eyebrow>
          <div style={{ fontFamily: "var(--serif)", fontSize: 22, lineHeight: 1, marginTop: 4 }}>
            {statusLabel}
          </div>
        </div>
        <div style={{
          width: 10,
          height: 10,
          borderRadius: 99,
          background: status === "available" ? "var(--moss)" : "var(--ink-4)",
          flexShrink: 0,
        }} />
      </div>

      {/* available / unavailable toggles */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => setStatus("available")}
          style={{
            border: status === "available" ? "none" : "0.5px solid var(--line)",
            borderRadius: 14,
            padding: "18px",
            background: status === "available" ? "var(--moss)" : "var(--card)",
            color: status === "available" ? "#fff" : "var(--ink-2)",
            fontSize: 14,
            fontWeight: 600,
            cursor: busy ? "wait" : "pointer",
            opacity: busy ? 0.6 : 1,
            minHeight: 44,
            fontFamily: "inherit",
          }}
        >
          {t("available")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setStatus("unavailable")}
          style={{
            border: status === "unavailable" ? "none" : "0.5px solid var(--line)",
            borderRadius: 14,
            padding: "18px",
            background: status === "unavailable" ? "var(--ink)" : "var(--card)",
            color: status === "unavailable" ? "var(--paper)" : "var(--ink-2)",
            fontSize: 14,
            fontWeight: 600,
            cursor: busy ? "wait" : "pointer",
            opacity: busy ? 0.6 : 1,
            minHeight: 44,
            fontFamily: "inherit",
          }}
        >
          {t("unavailable")}
        </button>
      </div>

      {error ? (
        <p style={{ margin: 0, color: "var(--rose)", fontWeight: 600, fontSize: 14 }}>{error}</p>
      ) : null}

      {/* info note */}
      <div
        style={{
          padding: "12px 16px",
          borderRadius: 12,
          background: "var(--card)",
          border: "0.5px solid var(--line)",
          color: "var(--ink-2)",
          fontSize: 13,
          lineHeight: 1.5,
        }}
        dangerouslySetInnerHTML={{ __html: t.raw("info") as string }}
      />

      {/* preferred cities */}
      <section style={{
        background: "var(--card)",
        border: "0.5px solid var(--line)",
        borderRadius: 18,
        padding: 18,
        display: "grid",
        gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <MapPin size={14} style={{ color: "var(--ink-3)" }} />
          <Eyebrow>{t("preferredCities")}</Eyebrow>
        </div>

        <p style={{ margin: 0, fontSize: 13, color: "var(--ink-2)", lineHeight: 1.45 }}>
          {t("citiesInfo")}
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {cities.length === 0 ? (
            <span style={{ color: "var(--ink-3)", fontSize: 13 }}>{t("noCities")}</span>
          ) : (
            cities.map((city) => (
              <span
                key={city}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  borderRadius: 999,
                  padding: "7px 12px",
                  background: "var(--moss-soft)",
                  color: "var(--moss)",
                  fontWeight: 500,
                  fontSize: 13,
                  border: "0.5px solid #C8DCC1",
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
                    color: "var(--moss)",
                    cursor: cityBusy ? "wait" : "pointer",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    opacity: 0.65,
                  }}
                >
                  <X size={12} />
                </button>
              </span>
            ))
          )}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={cityInput}
            placeholder={t("addCityPlaceholder")}
            onChange={(e) => setCityInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCity(); } }}
            disabled={cityBusy}
            style={{
              flex: 1,
              border: "0.5px solid var(--line)",
              borderRadius: 10,
              padding: "11px 14px",
              fontSize: 14,
              background: "#fff",
              color: "var(--ink)",
              font: "inherit",
              minHeight: 44,
              outline: "none",
            }}
          />
          <button
            type="button"
            disabled={cityBusy || !cityInput.trim()}
            onClick={addCity}
            style={{
              border: 0,
              borderRadius: 10,
              padding: "11px 18px",
              background: "var(--ink)",
              color: "var(--paper)",
              fontWeight: 600,
              fontSize: 14,
              cursor: cityBusy || !cityInput.trim() ? "default" : "pointer",
              opacity: cityBusy || !cityInput.trim() ? 0.4 : 1,
              fontFamily: "inherit",
              minHeight: 44,
            }}
          >
            {tCommon("add")}
          </button>
        </div>

        {cityError ? (
          <p style={{ margin: 0, color: "var(--rose)", fontWeight: 600, fontSize: 13 }}>{cityError}</p>
        ) : null}
      </section>

      {/* preferences */}
      <section>
        <Eyebrow style={{ marginBottom: 10 }}>{t("preferences")}</Eyebrow>
        <div style={{
          background: "var(--card)",
          border: "0.5px solid var(--line)",
          borderRadius: 16,
          overflow: "hidden",
        }}>
          <ToggleRow
            label={t("urgentAlerts")}
            sub={t("urgentAlertsSub")}
            on={urgentAlertsOn}
            onToggle={toggleUrgentAlerts}
            disabled={busy}
          />
          <ToggleRow
            label={t("notifyFar")}
            sub={t("notifyFarSub")}
            on={notifyFarOn}
            onToggle={toggleNotifyFar}
            disabled={busy}
          />
          <ToggleRow
            label={t("notifyWeekendOvernight")}
            sub={t("notifyWeekendOvernightSub")}
            on={notifyWeekendOvernightOn}
            onToggle={toggleNotifyWeekendOvernight}
            disabled={busy}
            last
          />
        </div>
      </section>
    </div>
  );
}

function ToggleRow({
  label,
  sub,
  on,
  onToggle,
  disabled,
  last,
}: {
  label: string;
  sub: string;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
  last?: boolean;
}) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      padding: "14px 16px",
      borderBottom: last ? "none" : "0.5px solid var(--line-soft)",
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{sub}</div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-checked={on}
        style={{
          width: 38,
          height: 22,
          borderRadius: 99,
          border: "none",
          cursor: disabled ? "wait" : "pointer",
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
  );
}
