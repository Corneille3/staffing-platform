"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { bulkInviteSubstitutes } from "../lib/browser-api";
import type { BulkInviteEntry, BulkInviteResult } from "../lib/types";

const emptyRow = (): BulkInviteEntry => ({
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  preferred_language: "fr",
});

const FIELD: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: "var(--r-sm)",
  border: "0.5px solid var(--line)",
  background: "var(--card)",
  color: "var(--ink)",
  fontSize: 13,
  outline: "none",
  fontFamily: "var(--ui)",
  width: "100%",
  boxSizing: "border-box",
};

export function ApfBulkInviteModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const t = useTranslations("apf.bulk");
  const [, startTransition] = useTransition();
  const [rows, setRows] = useState<BulkInviteEntry[]>([emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkInviteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function update(index: number, field: keyof BulkInviteEntry, value: string) {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(index: number) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const filled = rows
        .map((r) => ({
          first_name: r.first_name.trim(),
          last_name: r.last_name.trim(),
          email: r.email.trim(),
          phone: r.phone?.trim() || undefined,
          preferred_language: r.preferred_language || "fr",
        }))
        .filter((r) => r.email);
      if (filled.length === 0) {
        setError(t("needEmail"));
        return;
      }
      const res = await bulkInviteSubstitutes(filled);
      setResult(res);
      if (res.invited_count > 0) {
        startTransition(() => router.refresh());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(21, 20, 15, 0.45)",
        backdropFilter: "blur(4px)",
        display: "grid",
        placeItems: "center",
        zIndex: 100,
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 720,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--card)",
          color: "var(--ink)",
          borderRadius: "var(--r-lg)",
          padding: "28px 26px",
          boxShadow: "0 32px 64px rgba(0,0,0,0.18)",
          border: "0.5px solid var(--line)",
        }}
      >
        {result ? (
          <>
            <h2
              style={{
                margin: "0 0 12px",
                fontFamily: "var(--serif)",
                fontSize: 28,
                fontWeight: 400,
                color: "var(--ink)",
              }}
            >
              {t("result", { invited: result.invited_count, skipped: result.skipped_count })}
            </h2>
            <div style={{ display: "grid", gap: 6, marginBottom: 20 }}>
              {result.outcomes.map((o) => (
                <div
                  key={o.email}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    background: "var(--paper)",
                    border: "0.5px solid var(--line)",
                    borderRadius: "var(--r-sm)",
                    fontSize: 13,
                  }}
                >
                  <span>{o.email}</span>
                  <span
                    style={{
                      color: o.status === "invited" ? "var(--moss)" : "var(--rose)",
                      textTransform: "uppercase",
                      fontSize: 11,
                      letterSpacing: ".06em",
                      fontWeight: 500,
                    }}
                  >
                    {t.has(`status.${o.status}`) ? t(`status.${o.status}`) : o.status}
                    {o.reason ? ` · ${o.reason}` : ""}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "10px 18px",
                  borderRadius: 999,
                  background: "var(--terra)",
                  color: "var(--paper)",
                  border: 0,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {t("done")}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2
              style={{
                margin: "0 0 8px",
                fontFamily: "var(--serif)",
                fontSize: 26,
                fontWeight: 400,
                color: "var(--ink)",
              }}
            >
              {t("titleLead")} <em style={{ fontStyle: "italic" }}>{t("titleEm")}</em>
            </h2>
            <p style={{ margin: "0 0 20px", color: "var(--ink-2)", fontSize: 14, lineHeight: 1.5 }}>
              {t("body")}
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 1.2fr 1.8fr 1.2fr 0.6fr 40px",
                gap: 8,
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
                fontWeight: 500,
                marginBottom: 6,
                paddingBottom: 6,
                borderBottom: "0.5px solid var(--line)",
              }}
            >
              <span>{t("firstName")}</span>
              <span>{t("lastName")}</span>
              <span>{t("email")}</span>
              <span>{t("phone")}</span>
              <span>{t("lang")}</span>
              <span></span>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              {rows.map((row, i) => (
                <div
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.2fr 1.2fr 1.8fr 1.2fr 0.6fr 40px",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <input
                    style={FIELD}
                    placeholder="Ada"
                    value={row.first_name}
                    onChange={(e) => update(i, "first_name", e.target.value)}
                  />
                  <input
                    style={FIELD}
                    placeholder="Lovelace"
                    value={row.last_name}
                    onChange={(e) => update(i, "last_name", e.target.value)}
                  />
                  <input
                    style={FIELD}
                    type="email"
                    placeholder="ada@example.com"
                    value={row.email}
                    onChange={(e) => update(i, "email", e.target.value)}
                  />
                  <input
                    style={FIELD}
                    type="tel"
                    placeholder="+1 555 0000"
                    value={row.phone}
                    onChange={(e) => update(i, "phone", e.target.value)}
                  />
                  <select
                    style={{ ...FIELD, appearance: "none" }}
                    value={row.preferred_language ?? "fr"}
                    onChange={(e) => update(i, "preferred_language", e.target.value)}
                  >
                    <option value="fr">FR</option>
                    <option value="en">EN</option>
                    <option value="bilingual">FR+EN</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    disabled={rows.length === 1}
                    style={{
                      background: "transparent",
                      border: "0.5px solid var(--line)",
                      borderRadius: 999,
                      color: "var(--ink-3)",
                      fontSize: 14,
                      cursor: rows.length === 1 ? "not-allowed" : "pointer",
                      opacity: rows.length === 1 ? 0.4 : 1,
                      padding: "4px 0",
                    }}
                    aria-label={t("removeRow")}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addRow}
              style={{
                marginTop: 12,
                padding: "8px 14px",
                borderRadius: 999,
                background: "transparent",
                border: "0.5px dashed var(--line)",
                color: "var(--ink-2)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {t("addAnother")}
            </button>

            {error && <p style={{ margin: "16px 0 0", color: "var(--rose)", fontSize: 13 }}>{error}</p>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                style={{
                  padding: "10px 18px",
                  borderRadius: 999,
                  background: "transparent",
                  border: "0.5px solid var(--line)",
                  color: "var(--ink)",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                style={{
                  padding: "10px 18px",
                  borderRadius: 999,
                  background: "var(--terra)",
                  color: "var(--paper)",
                  border: 0,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? t("inviting") : t("send")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
