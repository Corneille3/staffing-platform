import { ReactNode } from "react";

export function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <article
      style={{
        borderRadius: 18,
        background: "var(--card)",
        border: "0.5px solid var(--line)",
        padding: 22,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "baseline" }}>
        <h2
          style={{
            margin: 0,
            fontFamily: "var(--serif)",
            fontSize: 22,
            lineHeight: 1.15,
            fontWeight: 400,
            color: "var(--ink)",
          }}
        >
          {title}
        </h2>
        {subtitle ? (
          <span style={{ fontSize: 12, color: "var(--ink-3)", letterSpacing: "0.02em" }}>{subtitle}</span>
        ) : null}
      </div>
      <div style={{ marginTop: 16 }}>{children}</div>
    </article>
  );
}
