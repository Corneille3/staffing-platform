"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const browserApiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

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

  async function updateAvailability(nextStatus: "available" | "unavailable") {
    const previousStatus = status;
    setStatus(nextStatus);
    setError(null);

    const response = await fetch(`${browserApiBaseUrl}/api/v1/workers/${workerId}/availability`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ availability_status: nextStatus }),
    });

    if (!response.ok) {
      setStatus(previousStatus);
      const text = await response.text();
      setError(text || `Update failed with status ${response.status}`);
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          disabled={isPending}
          onClick={() => updateAvailability("available")}
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
          onClick={() => updateAvailability("unavailable")}
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
