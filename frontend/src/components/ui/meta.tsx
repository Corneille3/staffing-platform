import React from "react";

interface MetaProps {
  icon: React.ReactNode;
  label: string;
  sub?: string;
}

export function Meta({ icon, label, sub }: MetaProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        background: "var(--paper)",
        borderRadius: 10,
      }}
    >
      <span style={{ color: "var(--ink-3)", display: "flex" }}>{icon}</span>
      <div style={{ lineHeight: 1.15 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)" }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: "var(--ink-3)" }}>{sub}</div>}
      </div>
    </div>
  );
}
