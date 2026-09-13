import React from "react";

type AvatarTone = "paper" | "terra" | "moss" | "sand";

const toneStyles: Record<AvatarTone, React.CSSProperties> = {
  paper: { background: "var(--paper-2)", color: "var(--ink)" },
  terra: { background: "var(--terra-soft)", color: "var(--terra-ink)" },
  moss:  { background: "var(--moss-soft)", color: "var(--moss)" },
  sand:  { background: "var(--sand-soft)", color: "#7C5C12" },
};

interface AvatarProps {
  initials: string;
  tone?: AvatarTone;
  size?: number;
}

export function Avatar({ initials, tone = "paper", size = 32 }: AvatarProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.375,
        fontWeight: 600,
        border: "0.5px solid var(--line)",
        flexShrink: 0,
        ...toneStyles[tone],
      }}
    >
      {initials}
    </div>
  );
}
