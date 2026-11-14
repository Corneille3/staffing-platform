"use client";

// Pieces shared by the leads list and the lead page. Client-only: server
// pages render these components but never call anything exported from here.

import type { CSSProperties, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import type { LeadStatus } from "../lib/types";

// Colour rule (same as the worker screens): moss = positive, terra =
// attention/active, sand = informative, paper-2 + ink-3 = inactive, rose = bad.
export const LEAD_STATUS_TONE: Record<LeadStatus, { bg: string; c: string }> = {
  new: { bg: "var(--paper-2)", c: "var(--ink-2)" },
  contacted: { bg: "var(--sand-soft)", c: "#8C6B14" },
  demo_booked: { bg: "var(--terra-soft)", c: "var(--terra-ink)" },
  pilot: { bg: "var(--terra-soft)", c: "var(--terra-ink)" },
  invited: { bg: "var(--sand-soft)", c: "#8C6B14" },
  won: { bg: "var(--moss-soft)", c: "var(--moss)" },
  lost: { bg: "var(--rose-soft)", c: "var(--rose)" },
};

export function LeadStatusChip({ status }: { status: LeadStatus }) {
  const t = useTranslations("platform.leads.status");
  const tone = LEAD_STATUS_TONE[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 500,
        whiteSpace: "nowrap",
        background: tone.bg,
        color: tone.c,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: 99, background: tone.c }} />
      {t(status)}
    </span>
  );
}

/** Enterprise / Channel badge next to the name; a plain prospect has none. */
export function LeadKindBadge({ kind }: { kind: string }) {
  const t = useTranslations("platform.leads.kind");
  if (kind !== "enterprise" && kind !== "channel") return null;
  const enterprise = kind === "enterprise";
  return (
    <span
      style={{
        padding: "1px 7px",
        borderRadius: 999,
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: ".04em",
        textTransform: "uppercase",
        flexShrink: 0,
        background: enterprise ? "var(--ink)" : "transparent",
        color: enterprise ? "var(--paper)" : "var(--ink-2)",
        border: `0.5px solid ${enterprise ? "var(--ink)" : "var(--ink-3)"}`,
      }}
    >
      {t(kind)}
    </span>
  );
}

export function LeadModal({
  eyebrow,
  title,
  titleEm,
  width = 480,
  onClose,
  children,
}: {
  eyebrow: string;
  title: string;
  titleEm: string;
  width?: number;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(21,20,15,.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          ...leadCard,
          width,
          maxWidth: "100%",
          maxHeight: "calc(100vh - 40px)",
          overflowY: "auto",
          padding: "28px 30px",
          background: "#fff",
          boxShadow: "0 30px 80px -20px rgba(0,0,0,.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={leadEyebrow}>{eyebrow}</div>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: 28, lineHeight: 1.05, margin: "4px 0 0", fontWeight: 400 }}>
              {title} <em style={{ fontStyle: "italic" }}>{titleEm}</em>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ ...leadRowBtn, width: 32, height: 32, borderRadius: 99, padding: 0, justifyContent: "center" }}
          >
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function LeadFieldLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: "var(--ink-3)",
        letterSpacing: ".08em",
        textTransform: "uppercase",
        fontWeight: 500,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

export const leadCard: CSSProperties = {
  background: "var(--card)",
  border: "0.5px solid var(--line)",
  borderRadius: "var(--r-lg)",
};

export const leadEyebrow: CSSProperties = {
  fontSize: 11,
  color: "var(--ink-3)",
  letterSpacing: ".14em",
  textTransform: "uppercase",
  fontWeight: 500,
};

export const leadPrimaryBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "11px 18px",
  borderRadius: 999,
  background: "var(--ink)",
  border: 0,
  color: "var(--paper)",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "var(--ui)",
  whiteSpace: "nowrap",
};

export const leadGhostBtn: CSSProperties = {
  ...leadPrimaryBtn,
  background: "transparent",
  border: "0.5px solid var(--line)",
  color: "var(--ink)",
};

export const leadRowBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  borderRadius: 999,
  background: "transparent",
  border: "0.5px solid var(--line)",
  color: "var(--ink)",
  fontSize: 11,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "var(--ui)",
};

export const leadInput: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "0.5px solid var(--line)",
  background: "var(--paper)",
  fontFamily: "var(--ui)",
  fontSize: 14,
  color: "var(--ink)",
  outline: "none",
  boxSizing: "border-box",
};
