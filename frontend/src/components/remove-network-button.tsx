"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeNetwork } from "../lib/browser-api";

export function RemoveNetworkButton({
  tenantId,
  tenantName,
  isActive,
  isOwnTenant,
}: {
  tenantId: string;
  tenantName: string;
  isActive: boolean;
  isOwnTenant: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isActive) {
    return (
      <span style={{ fontSize: 11, opacity: 0.45, fontStyle: "italic" }}>
        removed
      </span>
    );
  }

  if (isOwnTenant) {
    return (
      <span
        style={{ fontSize: 11, opacity: 0.45, fontStyle: "italic" }}
        title="You cannot remove your own network"
      >
        your network
      </span>
    );
  }

  async function confirm() {
    setError(null);
    try {
      await removeNetwork(tenantId);
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Removal failed");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          background: "transparent",
          border: "1px solid rgba(214,128,106,0.4)",
          color: "#d6806a",
          padding: "4px 10px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          cursor: "pointer",
        }}
      >
        Remove
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 31, 26, 0.78)",
            backdropFilter: "blur(6px)",
            display: "grid",
            placeItems: "center",
            zIndex: 100,
            padding: 24,
          }}
          onClick={() => !isPending && setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 520,
              width: "100%",
              background: "#fffdf7",
              color: "#183229",
              borderRadius: 20,
              padding: "28px 26px",
              boxShadow: "0 28px 60px rgba(0,0,0,0.45)",
            }}
          >
            <h2 style={{ margin: "0 0 12px", fontSize: 22 }}>
              Remove {tenantName}?
            </h2>
            <p style={{ margin: "0 0 14px", lineHeight: 1.5, color: "#3d564c", fontSize: 14 }}>
              This deactivates the network and <strong>every member</strong> in it
              — the network admin, all coordinators, all substitutes. They will be
              signed out immediately and cannot sign back in. Their email
              addresses are released so the same people can be re-invited later
              under a fresh account.
            </p>
            <p style={{ margin: "0 0 22px", lineHeight: 1.5, color: "#3d564c", fontSize: 14 }}>
              Audit history is preserved.
            </p>

            {error ? (
              <p
                style={{
                  margin: "0 0 14px",
                  color: "#8c3f32",
                  background: "#f7e2dc",
                  padding: "10px 12px",
                  borderRadius: 10,
                  fontSize: 13,
                }}
              >
                {error}
              </p>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={isPending}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(24,50,41,0.2)",
                  color: "#183229",
                  padding: "10px 18px",
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: isPending ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={isPending}
                style={{
                  background: "#7a473f",
                  border: 0,
                  color: "#f7f0df",
                  padding: "10px 18px",
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: isPending ? "not-allowed" : "pointer",
                }}
              >
                {isPending ? "Removing…" : "Remove network"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
