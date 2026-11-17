"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { removeOrganization } from "../lib/browser-api";

export function RemoveOrganizationButton({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const router = useRouter();
  const t = useTranslations("apf.remove");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function confirm() {
    setError(null);
    try {
      await removeOrganization(organizationId);
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failed"));
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
          width: "fit-content",
        }}
      >
        {t("button")}
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
              maxWidth: 460,
              width: "100%",
              background: "#fffdf7",
              color: "#183229",
              borderRadius: 20,
              padding: "28px 26px",
              boxShadow: "0 28px 60px rgba(0,0,0,0.45)",
            }}
          >
            <h2 style={{ margin: "0 0 12px", fontSize: 22 }}>
              {t("title", { name: organizationName })}
            </h2>
            <p style={{ margin: "0 0 14px", lineHeight: 1.5, color: "#3d564c", fontSize: 14 }}>
              {t("orgBody")}
            </p>
            <p style={{ margin: "0 0 20px", lineHeight: 1.5, color: "#3d564c", fontSize: 14 }}>
              {t("orgNote")}
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
                {t("cancel")}
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
                {isPending ? t("removing") : t("button")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
