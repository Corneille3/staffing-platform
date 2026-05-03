"use client";

import { useMemo, useState } from "react";
import { Worker } from "../lib/types";
import { WorkerAvailabilityControl } from "./worker-availability-control";

const LANGUAGE_LABELS: Record<string, string> = {
  fr: "French",
  en: "English",
  bilingual: "Bilingual",
};

export function SubstituteDirectory({ workers }: { workers: Worker[] }) {
  const [availFilter, setAvailFilter] = useState<"all" | "available" | "unavailable">("all");
  const [cityFilter, setCityFilter] = useState("");
  const [langFilter, setLangFilter] = useState("");
  const [qualSearch, setQualSearch] = useState("");

  const cityOptions = useMemo(
    () =>
      Array.from(
        new Set(workers.flatMap((w) => w.profile?.supported_cities ?? [])),
      ).sort(),
    [workers],
  );

  const langOptions = useMemo(
    () => Array.from(new Set(workers.map((w) => w.preferred_language))).sort(),
    [workers],
  );

  const filtered = useMemo(() => {
    return workers.filter((w) => {
      if (availFilter !== "all" && w.profile?.availability_status !== availFilter) return false;
      if (cityFilter && !w.profile?.supported_cities.includes(cityFilter)) return false;
      if (langFilter && w.preferred_language !== langFilter) return false;
      if (qualSearch) {
        const q = qualSearch.toLowerCase();
        const quals = (w.profile?.qualifications ?? []).join(" ").toLowerCase();
        const certs = (w.profile?.certifications ?? []).join(" ").toLowerCase();
        if (!quals.includes(q) && !certs.includes(q)) return false;
      }
      return true;
    });
  }, [workers, availFilter, cityFilter, langFilter, qualSearch]);

  const hasFilters = availFilter !== "all" || cityFilter || langFilter || qualSearch;

  const inputStyle = {
    borderRadius: 12,
    border: "1px solid rgba(24, 50, 41, 0.16)",
    background: "#fffdf7",
    color: "#183229",
    fontSize: 14,
    minHeight: 40,
    padding: "0 12px",
    font: "inherit",
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(["all", "available", "unavailable"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setAvailFilter(v)}
              style={{
                border: availFilter === v ? "1px solid #214639" : "1px solid rgba(24, 50, 41, 0.16)",
                borderRadius: 999,
                padding: "8px 16px",
                background: availFilter === v ? "#214639" : "#fffdf7",
                color: availFilter === v ? "#f7f0df" : "#214639",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {v === "all" ? "All" : v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 800, color: "#496158" }}>
            City
            <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} style={inputStyle}>
              <option value="">Any city</option>
              {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 800, color: "#496158" }}>
            Language
            <select value={langFilter} onChange={(e) => setLangFilter(e.target.value)} style={inputStyle}>
              <option value="">Any language</option>
              {langOptions.map((l) => <option key={l} value={l}>{LANGUAGE_LABELS[l] ?? l}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 800, color: "#496158" }}>
            Qualification / certification
            <input
              value={qualSearch}
              onChange={(e) => setQualSearch(e.target.value)}
              placeholder="e.g. ECE_LEVEL_1"
              style={inputStyle}
            />
          </label>
        </div>

        {hasFilters ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#496158" }}>
              {filtered.length} of {workers.length} substitutes
            </span>
            <button
              type="button"
              onClick={() => { setAvailFilter("all"); setCityFilter(""); setLangFilter(""); setQualSearch(""); }}
              style={{ border: 0, background: "transparent", color: "#214639", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <span style={{ fontSize: 13, color: "#496158" }}>{workers.length} substitutes</span>
        )}
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 20, borderRadius: 16, background: "#f5f2eb", color: "#5d6d66", textAlign: "center", fontSize: 14 }}>
            No substitutes match these filters.
          </div>
        ) : (
          filtered.map((worker) => (
            <article
              key={worker.id}
              style={{
                borderRadius: 22,
                padding: 20,
                background: "#fffdf7",
                border: "1px solid rgba(24, 50, 41, 0.1)",
                display: "grid",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 22 }}>
                    {worker.first_name} {worker.last_name}
                  </h2>
                  <p style={{ margin: "4px 0 0", color: "#496158", fontSize: 14 }}>{worker.email}</p>
                </div>
                <WorkerAvailabilityControl
                  workerId={worker.id}
                  currentStatus={worker.profile?.availability_status ?? "unknown"}
                />
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <Chip tone="neutral">{LANGUAGE_LABELS[worker.preferred_language] ?? worker.preferred_language}</Chip>
                {(worker.profile?.supported_cities ?? []).map((city) => (
                  <Chip key={city} tone="city">{city}</Chip>
                ))}
              </div>

              {(worker.profile?.qualifications?.length ?? 0) > 0 || (worker.profile?.certifications?.length ?? 0) > 0 ? (
                <div style={{ display: "grid", gap: 4, fontSize: 13, color: "#3d564c" }}>
                  {(worker.profile?.qualifications?.length ?? 0) > 0 ? (
                    <span><strong>Qualifications:</strong> {worker.profile!.qualifications.join(", ")}</span>
                  ) : null}
                  {(worker.profile?.certifications?.length ?? 0) > 0 ? (
                    <span><strong>Certifications:</strong> {worker.profile!.certifications.join(", ")}</span>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function Chip({ tone, children }: { tone: "neutral" | "city"; children: React.ReactNode }) {
  const palette =
    tone === "city"
      ? { bg: "#e4eadf", color: "#214639" }
      : { bg: "#efe3b9", color: "#5d4c37" };
  return (
    <span
      style={{
        borderRadius: 999,
        padding: "4px 10px",
        background: palette.bg,
        color: palette.color,
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {children}
    </span>
  );
}
