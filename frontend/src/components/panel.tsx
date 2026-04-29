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
        borderRadius: 28,
        background: "rgba(249, 245, 234, 0.9)",
        padding: 24,
        boxShadow: "0 18px 36px rgba(24, 50, 41, 0.1)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "baseline" }}>
        <h2 style={{ margin: 0, fontSize: 30 }}>{title}</h2>
        {subtitle ? <span style={{ fontSize: 14, color: "#4b5f57" }}>{subtitle}</span> : null}
      </div>
      <div style={{ marginTop: 18 }}>{children}</div>
    </article>
  );
}
