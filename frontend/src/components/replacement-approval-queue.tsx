"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { approveReplacement, denyReplacement } from "../lib/browser-api";
import type { ReplacementFeedItem } from "../lib/types";

function fmtDate(value: string): string {
  try {
    return new Date(value).toLocaleDateString("fr-CA", { month: "short", day: "numeric" });
  } catch {
    return value;
  }
}

/** Approval mode (§6.1): the "À valider avant diffusion" queue — the only place
 * the coordinator is in the loop. Absent in auto mode. */
export function ReplacementApprovalQueue({ items }: { items: ReplacementFeedItem[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (items.length === 0) return null;

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{
      background: "var(--sand-soft)",
      border: "0.5px solid #E2D49A",
      borderRadius: 16,
      padding: "16px 18px",
      marginBottom: 22,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#8C6B14", marginBottom: 4 }}>
        À valider avant diffusion
      </div>
      <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5 }}>
        Ces quarts libérés attendent votre approbation avant d&apos;être diffusés au bassin.
      </p>
      {error && <p style={{ margin: "0 0 10px", color: "var(--rose)", fontSize: 12 }}>{error}</p>}
      <div style={{ display: "grid", gap: 10 }}>
        {items.map((item) => {
          const busy = busyId === item.request_id;
          return (
            <div
              key={item.request_id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                background: "var(--card)",
                border: "0.5px solid var(--line)",
                borderRadius: 12,
                padding: "12px 14px",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {item.giver_name} · {item.title}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                  {fmtDate(item.work_date)} · {item.start_time.slice(0, 5)}–{item.end_time.slice(0, 5)}
                  {item.reason ? ` · ${item.reason}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => act(item.request_id, () => denyReplacement(item.request_id))}
                  disabled={busy}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "8px 12px", borderRadius: 99,
                    border: "0.5px solid var(--line)", background: "transparent",
                    color: "var(--ink-2)", fontSize: 12, fontWeight: 600,
                    cursor: busy ? "wait" : "pointer", fontFamily: "inherit",
                  }}
                >
                  <X size={13} /> Refuser
                </button>
                <button
                  type="button"
                  onClick={() => act(item.request_id, () => approveReplacement(item.request_id))}
                  disabled={busy}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "8px 12px", borderRadius: 99,
                    border: "none", background: "var(--moss)", color: "#fff",
                    fontSize: 12, fontWeight: 600,
                    cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1, fontFamily: "inherit",
                  }}
                >
                  <Check size={13} /> Approuver & diffuser
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
