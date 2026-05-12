import React from "react";

interface CardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export function Card({ children, style, className }: CardProps) {
  return (
    <div
      className={className}
      style={{
        background: "var(--card)",
        borderRadius: "var(--r-lg)",
        border: "0.5px solid var(--line)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
