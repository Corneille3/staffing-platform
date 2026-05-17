"use client";

import { useMemo, useState } from "react";
import { Worker } from "../lib/types";
import { Eyebrow } from "./ui";
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

  const inputStyle: React.CSSProperties = {
    borderRadius: 10,
    border: "0.5px solid var(--line)",
    background: "#fff",
    color: "var(--ink)",
    fontSize: 14,
    minHeight: 40,
    padding: "0 12px",
    font: "inherit",
    outline: "none",
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(["all", "available", "unavailable"] as const).map((v) => {
            const active = availFilter === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setAvailFilter(v)}
                style={{
                  border: active ? "1px solid var(--terra)" : "0.5px solid var(--line)",
                  borderRadius: 999,
                  padding: "7px 14px",
                  background: active ? "var(--terra-soft)" : "var(--card)",
                  color: active ? "var(--terra)" : "var(--ink-2)",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {v === "all" ? "All" : v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <Eyebrow>City</Eyebrow>
            <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} style={inputStyle}>
              <option value="">Any city</option>
              {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <Eyebrow>Language</Eyebrow>
            <select value={langFilter} onChange={(e) => setLangFilter(e.target.value)} style={inputStyle}>
              <option value="">Any language</option>
              {langOptions.map((l) => <option key={l} value={l}>{LANGUAGE_LABELS[l] ?? l}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <Eyebrow>Qualification / certification</Eyebrow>
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
            <span style={{ fontSize: 13, color: "var(--ink-3)" }}>
              {filtered.length} of {workers.length} substitutes
            </span>
            <button
              type="button"
              onClick={() => { setAvailFilter("all"); setCityFilter(""); setLangFilter(""); setQualSearch(""); }}
              style={{ border: 0, background: "transparent", color: "var(--terra)", fontWeight: 500, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <span style={{ fontSize: 13, color: "var(--ink-3)" }}>{workers.length} substitutes</span>
        )}
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 20, borderRadius: 14, background: "var(--paper-2)", color: "var(--ink-3)", textAlign: "center", fontSize: 13, border: "0.5px solid var(--line)" }}>
            No substitutes match these filters.
          </div>
        ) : (
          filtered.map((worker) => (
            <article
              key={worker.id}
              style={{
                borderRadius: 14,
                padding: 18,
                background: "var(--card)",
                border: "0.5px solid var(--line)",
                display: "grid",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                  <h3 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 20, lineHeight: 1.1, fontWeight: 400 }}>
                    {worker.first_name} {worker.last_name}
                  </h3>
                  <p style={{ margin: "4px 0 0", color: "var(--ink-3)", fontSize: 13 }}>{worker.email}</p>
                </div>
                <WorkerAvailabilityControl
                  workerId={worker.id}
                  currentStatus={worker.profile?.availability_status ?? "unknown"}
                />
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <Chip tone="neutral">{LANGUAGE_LABELS[worker.preferred_language] ?? worker.preferred_language}</Chip>
                {(worker.profile?.supported_cities ?? []).map((city) => (
                  <Chip key={city} tone="city">{city}</Chip>
                ))}
              </div>

              {(worker.profile?.qualifications?.length ?? 0) > 0 || (worker.profile?.certifications?.length ?? 0) > 0 ? (
                <div style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--ink-2)" }}>
                  {(worker.profile?.qualifications?.length ?? 0) > 0 ? (
                    <span><strong style={{ color: "var(--ink)" }}>Qualifications:</strong> {worker.profile!.qualifications.join(", ")}</span>
                  ) : null}
                  {(worker.profile?.certifications?.length ?? 0) > 0 ? (
                    <span><strong style={{ color: "var(--ink)" }}>Certifications:</strong> {worker.profile!.certifications.join(", ")}</span>
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
      ? { bg: "var(--moss-soft)", color: "var(--moss)" }
      : { bg: "var(--sand-soft)", color: "#8C6B14" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        padding: "4px 10px",
        background: palette.bg,
        color: palette.color,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.02em",
      }}
    >
      {children}
    </span>
  );
}
