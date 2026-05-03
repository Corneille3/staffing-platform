"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { onboardWorker } from "../../../lib/browser-api";
import { useWorkerSession } from "../../../lib/worker-session";

const COMMON_QUALS = ["ECE_LEVEL_1", "ECE_LEVEL_2", "ECE_LEVEL_3", "RSG", "TES"];
const COMMON_CERTS = ["FIRST_AID", "CPR", "FOOD_SAFETY"];

function ChipPicker({
  label,
  values,
  suggestions,
  onChange,
}: {
  label: string;
  values: string[];
  suggestions: string[];
  onChange: (next: string[]) => void;
}) {
  const [input, setInput] = useState("");

  function add(val: string) {
    const trimmed = val.trim().toUpperCase();
    if (trimmed && !values.includes(trimmed)) onChange([...values, trimmed]);
    setInput("");
  }

  function remove(val: string) {
    onChange(values.filter((v) => v !== val));
  }

  return (
    <div>
      <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, color: "#183229" }}>{label}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        {suggestions.filter((s) => !values.includes(s)).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => add(s)}
            style={{
              padding: "6px 14px", borderRadius: 999, border: "1.5px dashed rgba(24,50,41,0.25)",
              background: "transparent", color: "#496158", cursor: "pointer", fontSize: 13, fontWeight: 600,
            }}
          >
            + {s}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        {values.map((v) => (
          <span
            key={v}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 999, background: "#183229",
              color: "#f7f0df", fontSize: 13, fontWeight: 700,
            }}
          >
            {v}
            <button
              type="button"
              onClick={() => remove(v)}
              style={{ background: "none", border: 0, color: "#f7f0df", cursor: "pointer", padding: 0, lineHeight: 1, fontSize: 15, opacity: 0.7 }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(input); } }}
          placeholder="Type to add…"
          style={{
            flex: 1, padding: "10px 14px", borderRadius: 10,
            border: "1.5px solid rgba(24,50,41,0.2)", background: "#fff",
            color: "#183229", fontSize: 14, outline: "none",
          }}
        />
        <button
          type="button"
          onClick={() => add(input)}
          style={{
            padding: "10px 16px", borderRadius: 10, border: 0,
            background: "#183229", color: "#f7f0df", cursor: "pointer", fontSize: 14, fontWeight: 700,
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function CityPicker({ cities, onChange }: { cities: string[]; onChange: (next: string[]) => void }) {
  const [input, setInput] = useState("");

  function add(val: string) {
    const trimmed = val.trim();
    if (trimmed && !cities.includes(trimmed)) onChange([...cities, trimmed]);
    setInput("");
  }

  function remove(city: string) {
    onChange(cities.filter((c) => c !== city));
  }

  return (
    <div>
      <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, color: "#183229" }}>
        Cities you can cover
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        {cities.map((c) => (
          <span
            key={c}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 999, background: "#183229",
              color: "#f7f0df", fontSize: 13, fontWeight: 700,
            }}
          >
            {c}
            <button
              type="button"
              onClick={() => remove(c)}
              style={{ background: "none", border: 0, color: "#f7f0df", cursor: "pointer", padding: 0, lineHeight: 1, fontSize: 15, opacity: 0.7 }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(input); } }}
          placeholder="City name…"
          style={{
            flex: 1, padding: "10px 14px", borderRadius: 10,
            border: "1.5px solid rgba(24,50,41,0.2)", background: "#fff",
            color: "#183229", fontSize: 14, outline: "none",
          }}
        />
        <button
          type="button"
          onClick={() => add(input)}
          style={{
            padding: "10px 16px", borderRadius: 10, border: 0,
            background: "#183229", color: "#f7f0df", cursor: "pointer", fontSize: 14, fontWeight: 700,
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { worker, refresh } = useWorkerSession();

  const [cities, setCities] = useState<string[]>([]);
  const [quals, setQuals] = useState<string[]>([]);
  const [certs, setCerts] = useState<string[]>([]);
  const [urgentAlerts, setUrgentAlerts] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!worker) return;
    if (cities.length === 0) {
      setError("Please add at least one city.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onboardWorker(worker.id, {
        availability_status: "available",
        urgent_alert_opt_in: urgentAlerts,
        supported_cities: cities,
        qualifications: quals,
        certifications: certs,
      });
      await refresh();
      router.push("/worker");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!worker) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(180deg,#f7f0df 0%,#ebe5d8 100%)", display: "grid", placeItems: "center" }}>
        <p style={{ color: "#183229", opacity: 0.7 }}>Loading…</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg,#f7f0df 0%,#ebe5d8 100%)", color: "#183229" }}>
      <div style={{ maxWidth: 540, margin: "0 auto", padding: "48px 20px 80px" }}>
        <p style={{ margin: "0 0 6px", fontSize: 12, letterSpacing: "0.22em", textTransform: "uppercase", opacity: 0.6 }}>
          Welcome, {worker.first_name}
        </p>
        <h1 style={{ margin: "0 0 8px", fontSize: 32, lineHeight: 1.1 }}>Set up your profile</h1>
        <p style={{ margin: "0 0 36px", opacity: 0.75, lineHeight: 1.55 }}>
          Tell us where you can work and what qualifications you hold so coordinators can match you to coverage requests.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 32 }}>
          <CityPicker cities={cities} onChange={setCities} />

          <ChipPicker
            label="Qualifications"
            values={quals}
            suggestions={COMMON_QUALS}
            onChange={setQuals}
          />

          <ChipPicker
            label="Certifications"
            values={certs}
            suggestions={COMMON_CERTS}
            onChange={setCerts}
          />

          <div>
            <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700 }}>Urgent alerts</p>
            <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={urgentAlerts}
                onChange={(e) => setUrgentAlerts(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: "#183229" }}
              />
              <span style={{ fontSize: 15, lineHeight: 1.4 }}>
                Notify me immediately for urgent same-day replacements
              </span>
            </label>
          </div>

          {error && <p style={{ margin: 0, color: "#c0392b", fontSize: 14 }}>{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: "16px 24px", borderRadius: 14, border: 0,
              background: "#183229", color: "#f7f0df",
              fontSize: 16, fontWeight: 800, cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Saving…" : "Complete setup →"}
          </button>
        </form>
      </div>
    </div>
  );
}
