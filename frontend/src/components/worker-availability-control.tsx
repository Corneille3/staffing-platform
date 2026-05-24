"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateAvailability } from "../lib/browser-api";

export function WorkerAvailabilityControl({
  workerId,
  currentStatus,
}: {
  workerId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function setNext(nextStatus: "available" | "unavailable") {
    const previous = status;
    setStatus(nextStatus);
    setError(null);

    try {
      await updateAvailability(workerId, nextStatus);
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setStatus(previous);
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  return (
    <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setNext("available")}
          style={{
            border: status === "available" ? "1px solid var(--moss)" : "0.5px solid var(--line)",
            borderRadius: 999,
            padding: "6px 12px",
            background: status === "available" ? "var(--moss)" : "transparent",
            color: status === "available" ? "#FFFFFF" : "var(--ink-2)",
            cursor: isPending ? "wait" : "pointer",
            fontWeight: 500,
            fontSize: 12,
            fontFamily: "inherit",
          }}
        >
          Available
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setNext("unavailable")}
          style={{
            border: status === "unavailable" ? "1px solid var(--ink)" : "0.5px solid var(--line)",
            borderRadius: 999,
            padding: "6px 12px",
            background: status === "unavailable" ? "var(--ink)" : "transparent",
            color: status === "unavailable" ? "var(--paper)" : "var(--ink-2)",
            cursor: isPending ? "wait" : "pointer",
            fontWeight: 500,
            fontSize: 12,
            fontFamily: "inherit",
          }}
        >
          Unavailable
        </button>
      </div>
      {error ? <span style={{ color: "var(--rose)", fontSize: 12, fontWeight: 600 }}>{error}</span> : null}
    </div>
  );
}
