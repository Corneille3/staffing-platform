import React from "react";

export function Eyebrow({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        fontSize: 10,
        letterSpacing: ".2em",
        textTransform: "uppercase",
        color: "var(--ink-3)",
        fontWeight: 500,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Display({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <h1
      style={{
        fontFamily: "var(--serif)",
        fontWeight: 400,
        letterSpacing: "-0.01em",
        margin: 0,
        ...style,
      }}
    >
      {children}
    </h1>
  );
}

export function Mono({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span
      style={{
        fontFamily: "var(--mono)",
        fontFeatureSettings: '"tnum"',
        ...style,
      }}
    >
      {children}
    </span>
  );
}
