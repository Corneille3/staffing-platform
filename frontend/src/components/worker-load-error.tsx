"use client";

import { ReactNode } from "react";
import { RefreshCw } from "lucide-react";

/** Terra-bordered card the worker surface ends on when a load fails: it names
 * what could not be fetched and offers one way out. Shared by the Boîte (list
 * fetch) and the worker layout (session fetch), so a dead backend reads the
 * same whichever level it broke at — the layout's used to dump the browser's
 * own "Failed to fetch" on an otherwise empty page. */
export function WorkerLoadError({
  title,
  body,
  retryLabel,
  onRetry,
}: {
  title: ReactNode;
  body: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      style={{
        padding: "22px 18px",
        textAlign: "center",
        background: "var(--card)",
        border: "0.5px solid var(--terra)",
        borderRadius: 16,
      }}
    >
      <h2
        style={{
          fontFamily: "var(--serif)",
          fontSize: 22,
          lineHeight: 1.15,
          fontWeight: 400,
          margin: "0 0 8px",
        }}
      >
        {title}
      </h2>
      <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.45, margin: "0 0 18px" }}>
        {body}
      </p>
      <button
        type="button"
        onClick={onRetry}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          minHeight: 44,
          padding: "0 22px",
          borderRadius: 12,
          border: "none",
          background: "var(--terra)",
          color: "#fff",
          fontSize: 14,
          fontWeight: 500,
          fontFamily: "var(--ui)",
          cursor: "pointer",
        }}
      >
        <RefreshCw size={15} strokeWidth={1.8} />
        {retryLabel}
      </button>
    </div>
  );
}
