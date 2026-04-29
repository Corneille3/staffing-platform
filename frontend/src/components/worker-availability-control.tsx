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
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setNext("available")}
          style={{
            border: 0,
            borderRadius: 999,
            padding: "10px 14px",
            background: status === "available" ? "#214639" : "#dbe4dd",
            color: status === "available" ? "#f7f0df" : "#214639",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Available
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setNext("unavailable")}
          style={{
            border: 0,
            borderRadius: 999,
            padding: "10px 14px",
            background: status === "unavailable" ? "#7a473f" : "#eadfd7",
            color: status === "unavailable" ? "#fff7ef" : "#7a473f",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Unavailable
        </button>
      </div>
      {error ? <span style={{ color: "#8c3f32", fontSize: 13, fontWeight: 700 }}>{error}</span> : null}
    </div>
  );
}
