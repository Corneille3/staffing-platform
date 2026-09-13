import React from "react";

/** "À DÉCIDER · 3 demandes" — a section header line for the worker surface:
 * small-caps label left, a right-aligned count / summary, hairline below.
 * Introduced with the Boîte (worker-screens plan, étape 1), shared with the
 * Horaire (étape 3). */
export function SectionLine({
  label,
  count,
  style,
}: {
  label: string;
  count?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        paddingBottom: 8,
        marginBottom: 12,
        borderBottom: "0.5px solid var(--line)",
        ...style,
      }}
    >
      <span
        style={{
          fontSize: 11,
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      {count && <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{count}</span>}
    </div>
  );
}
