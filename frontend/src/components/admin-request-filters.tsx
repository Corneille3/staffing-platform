"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import type { AdminRequestTab } from "../lib/types";

const URGENCY = [
  { key: "all", label: "All urgency" },
  { key: "urgent", label: "Urgent" },
  { key: "planned", label: "Planned" },
];
const LANGUAGE = [
  { key: "all", label: "All languages" },
  { key: "fr", label: "French" },
  { key: "en", label: "English" },
  { key: "bilingual", label: "Bilingual" },
];

export function AdminRequestFilters({
  tab,
  siteId,
  urgency,
  language,
}: {
  tab: AdminRequestTab;
  siteId?: string;
  urgency: string;
  language: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const active = urgency !== "all" || language !== "all";

  function apply(next: { urgency?: string; language?: string }) {
    const p = new URLSearchParams();
    if (tab !== "active") p.set("tab", tab);
    if (siteId) p.set("site_id", siteId);
    const u = next.urgency ?? urgency;
    const l = next.language ?? language;
    if (u !== "all") p.set("urgency", u);
    if (l !== "all") p.set("language", l);
    const qs = p.toString();
    router.push(`/admin/requests${qs ? `?${qs}` : ""}`);
    setOpen(false);
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 12px",
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 500,
          fontFamily: "var(--ui)",
          cursor: "pointer",
          background: active ? "var(--ink)" : "transparent",
          color: active ? "var(--paper)" : "var(--ink-2)",
          border: `0.5px solid ${active ? "var(--ink)" : "var(--line)"}`,
        }}
      >
        <SlidersHorizontal size={13} /> More
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
          <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 21, background: "var(--card)", border: "0.5px solid var(--line)", borderRadius: 10, padding: 12, minWidth: 200, boxShadow: "0 8px 24px rgba(21,20,15,.12)", display: "grid", gap: 12 }}>
            <Group label="Urgency" options={URGENCY} value={urgency} onPick={(v) => apply({ urgency: v })} />
            <Group label="Language" options={LANGUAGE} value={language} onPick={(v) => apply({ language: v })} />
          </div>
        </>
      )}
    </div>
  );
}

function Group({ label, options, value, onPick }: { label: string; options: { key: string; label: string }[]; value: string; onPick: (v: string) => void }) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ink-3)", marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {options.map((o) => {
          const sel = o.key === value;
          return (
            <button
              key={o.key}
              onClick={() => onPick(o.key)}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 500,
                fontFamily: "var(--ui)",
                cursor: "pointer",
                background: sel ? "var(--terra-soft)" : "transparent",
                color: sel ? "var(--terra-ink)" : "var(--ink-2)",
                border: `0.5px solid ${sel ? "var(--terra)" : "var(--line)"}`,
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
