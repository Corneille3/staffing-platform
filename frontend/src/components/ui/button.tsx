import React from "react";

type ButtonVariant = "primary" | "terra" | "moss" | "ghost" | "danger";

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: { background: "var(--ink)",  color: "var(--paper)", border: "none" },
  terra:   { background: "var(--terra)", color: "#fff",         border: "none" },
  moss:    { background: "var(--moss)",  color: "#fff",         border: "none" },
  ghost:   { background: "transparent", color: "var(--ink)",   border: "0.5px solid var(--line)" },
  danger:  { background: "transparent", color: "var(--rose)",  border: "0.5px solid var(--rose-soft)" },
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: React.ReactNode;
}

export function Button({ variant = "primary", children, style, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      style={{
        appearance: "none",
        cursor: "pointer",
        fontFamily: "var(--ui)",
        fontWeight: 500,
        fontSize: 14,
        padding: "13px 18px",
        borderRadius: 14,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        transition: "opacity .15s",
        ...variantStyles[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}
