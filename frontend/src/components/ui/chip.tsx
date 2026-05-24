import React from "react";

type ChipVariant = "urgent" | "moss" | "sand" | "terra" | "ink" | "default";

const variantStyles: Record<ChipVariant, React.CSSProperties> = {
  urgent:  { background: "var(--rose-soft)",  color: "var(--rose)",      border: "none" },
  moss:    { background: "var(--moss-soft)",  color: "var(--moss)",      border: "none" },
  sand:    { background: "var(--sand-soft)",  color: "#8C6B14",          border: "none" },
  terra:   { background: "var(--terra-soft)", color: "var(--terra-ink)", border: "none" },
  ink:     { background: "var(--ink)",        color: "var(--paper)",     border: "none" },
  default: { background: "#fff",              color: "var(--ink)",       border: "0.5px solid var(--line)" },
};

interface ChipProps {
  variant?: ChipVariant;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function Chip({ variant = "default", dot = false, children, className, style }: ChipProps) {
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 11px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 500,
        ...variantStyles[variant],
        ...style,
      }}
    >
      {dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 99,
            background: "currentColor",
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  );
}
