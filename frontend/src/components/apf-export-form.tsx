"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { createApfExport, downloadApfExportCsv, getApfExportJob } from "../lib/browser-api";
import type { ApfExportJob, Organization } from "../lib/types";
import { Eyebrow, Mono } from "./ui";
import { shiftDateKey } from "../lib/shift-time";

interface Props {
  orgs: Organization[];
  initialOrgId?: string;
}

const FIELD: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: "var(--r-sm)",
  border: "0.5px solid var(--line)",
  background: "var(--card)",
  color: "var(--ink)",
  fontSize: 14,
  outline: "none",
  fontFamily: "var(--ui)",
  width: "100%",
  boxSizing: "border-box",
};

const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
  marginBottom: 6,
  fontWeight: 500,
};

function defaultRange(): { from: string; to: string } {
  // 30 days back through 30 days forward — captures both past actuals
  // (audit/reporting use case) and upcoming scheduled shifts (operational
  // export). The coordinator can narrow the window if they need either side.
  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - 30);
  const to = new Date(today);
  to.setDate(today.getDate() + 30);
  return {
    from: shiftDateKey(from),
    to: shiftDateKey(to),
  };
}

export function ApfExportForm({ orgs, initialOrgId }: Props) {
  const t = useTranslations("apf.export");
  const locale = useLocale();
  const range = defaultRange();
  const [dateFrom, setDateFrom] = useState(range.from);
  const [dateTo, setDateTo] = useState(range.to);
  const [selectedOrgs, setSelectedOrgs] = useState<string[]>(
    initialOrgId ? [initialOrgId] : [],
  );
  const [view, setView] = useState<"requests" | "worked_hours">("requests");
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<ApfExportJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const pollRef = useRef<number | null>(null);

  async function handleDownload() {
    if (!job) return;
    setDownloading(true);
    setError(null);
    try {
      const blob = await downloadApfExportCsv(job.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `staffig-export-${shiftDateKey()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("downloadFailed"));
    } finally {
      setDownloading(false);
    }
  }

  function toggleOrg(id: string) {
    setSelectedOrgs((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  useEffect(() => {
    if (!job || job.status !== "pending") return;
    let cancelled = false;
    async function poll() {
      try {
        const next = await getApfExportJob(job!.id);
        if (cancelled) return;
        setJob(next);
        if (next.status === "pending") {
          pollRef.current = window.setTimeout(poll, 1200);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t("pollingFailed"));
      }
    }
    pollRef.current = window.setTimeout(poll, 1200);
    return () => {
      cancelled = true;
      if (pollRef.current) window.clearTimeout(pollRef.current);
    };
  }, [job]);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const created = await createApfExport({
        date_from: dateFrom,
        date_to: dateTo,
        org_ids: selectedOrgs.length > 0 ? selectedOrgs : undefined,
        format: "csv",
        view,
      });
      setJob(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("exportFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setJob(null);
    setError(null);
  }

  return (
    <div style={{ maxWidth: 720 }}>
      {!job && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          style={{ display: "grid", gap: 20 }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={LABEL} htmlFor="date_from">
                {t("from")}
              </label>
              <input
                id="date_from"
                type="date"
                required
                style={FIELD}
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <label style={LABEL} htmlFor="date_to">
                {t("to")}
              </label>
              <input
                id="date_to"
                type="date"
                required
                style={FIELD}
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label style={LABEL}>{t("organizations")}</label>
            <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--ink-3)" }}>
              {t("orgsHint")}
            </p>
            {orgs.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--ink-3)" }}>{t("noOrgs")}</p>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {orgs.map((org) => {
                  const selected = selectedOrgs.includes(org.id);
                  return (
                    <button
                      key={org.id}
                      type="button"
                      onClick={() => toggleOrg(org.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 14px",
                        borderRadius: "var(--r-sm)",
                        cursor: "pointer",
                        textAlign: "left",
                        border: selected
                          ? "0.5px solid var(--terra)"
                          : "0.5px solid var(--line)",
                        background: selected ? "var(--terra-soft)" : "var(--card)",
                        color: "var(--ink)",
                        fontFamily: "var(--ui)",
                        fontSize: 13,
                      }}
                    >
                      <span
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 4,
                          flexShrink: 0,
                          border: selected ? "0.5px solid var(--terra)" : "0.5px solid var(--ink-4)",
                          background: selected ? "var(--terra)" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                          color: "var(--paper)",
                          fontWeight: 700,
                        }}
                      >
                        {selected ? "✓" : ""}
                      </span>
                      <span style={{ flex: 1 }}>{org.name}</span>
                      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{org.city}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label style={LABEL}>{t("view")}</label>
            <div style={{ display: "grid", gap: 6 }}>
              {(
                [
                  { value: "requests", label: t("viewRequests"), hint: t("viewRequestsHint") },
                  { value: "worked_hours", label: t("viewHours"), hint: t("viewHoursHint") },
                ] as const
              ).map((opt) => {
                const selected = view === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setView(opt.value)}
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 10,
                      padding: "10px 14px",
                      borderRadius: "var(--r-sm)",
                      cursor: "pointer",
                      textAlign: "left",
                      border: selected ? "0.5px solid var(--terra)" : "0.5px solid var(--line)",
                      background: selected ? "var(--terra-soft)" : "var(--card)",
                      color: "var(--ink)",
                      fontFamily: "var(--ui)",
                      fontSize: 13,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{opt.label}</span>
                    <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{opt.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label style={LABEL}>{t("format")}</label>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 14px",
                borderRadius: 999,
                background: "var(--paper)",
                border: "0.5px solid var(--line)",
                fontSize: 13,
                color: "var(--ink)",
              }}
            >
              CSV
            </div>
          </div>

          {error && <p style={{ margin: 0, color: "var(--rose)", fontSize: 13 }}>{error}</p>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: "12px 24px",
                borderRadius: 999,
                background: "var(--terra)",
                color: "var(--paper)",
                border: 0,
                fontSize: 14,
                fontWeight: 500,
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? t("submitting") : t("generate")}
            </button>
          </div>
        </form>
      )}

      {job && (
        <div
          style={{
            padding: 28,
            borderRadius: "var(--r-lg)",
            background:
              job.status === "ready"
                ? "var(--moss-soft)"
                : job.status === "failed"
                  ? "var(--rose-soft)"
                  : "var(--card)",
            border: `0.5px solid ${
              job.status === "ready"
                ? "var(--moss)"
                : job.status === "failed"
                  ? "var(--rose)"
                  : "var(--line)"
            }`,
          }}
        >
          <Eyebrow
            style={{
              color:
                job.status === "ready"
                  ? "var(--moss)"
                  : job.status === "failed"
                    ? "var(--rose)"
                    : "var(--ink-3)",
              marginBottom: 8,
            }}
          >
            {t("statusLine", { status: t.has(`status.${job.status}`) ? t(`status.${job.status}`) : job.status })}
          </Eyebrow>
          {job.status === "pending" && (
            <>
              <h2
                style={{
                  margin: "0 0 8px",
                  fontFamily: "var(--serif)",
                  fontSize: 24,
                  fontWeight: 400,
                  color: "var(--ink)",
                }}
              >
                {t("generating")}
              </h2>
              <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--ink-3)" }}>
                {t.rich("jobLine", {
                  id: job.id.slice(0, 8),
                  time: new Date(job.created_at).toLocaleTimeString(locale === "fr" ? "fr-CA" : "en-CA"),
                  m: (chunks) => <Mono>{chunks}</Mono>,
                })}
              </p>
            </>
          )}
          {job.status === "ready" && job.download_url && (
            <>
              <h2
                style={{
                  margin: "0 0 8px",
                  fontFamily: "var(--serif)",
                  fontSize: 24,
                  fontWeight: 400,
                  color: "var(--ink)",
                }}
              >
                {t("rows", { count: job.row_count ?? 0 })}
              </h2>
              <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--ink-2)" }}>
                {t("emailed")}
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading}
                  style={{
                    padding: "10px 18px",
                    borderRadius: 999,
                    border: "none",
                    background: "var(--terra)",
                    color: "var(--paper)",
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: downloading ? "wait" : "pointer",
                    opacity: downloading ? 0.6 : 1,
                    fontFamily: "inherit",
                  }}
                >
                  {downloading ? t("downloading") : t("download")}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  style={{
                    padding: "10px 18px",
                    borderRadius: 999,
                    background: "transparent",
                    border: "0.5px solid var(--line)",
                    color: "var(--ink)",
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  {t("runAnother")}
                </button>
              </div>
            </>
          )}
          {job.status === "failed" && (
            <>
              <h2
                style={{
                  margin: "0 0 8px",
                  fontFamily: "var(--serif)",
                  fontSize: 22,
                  fontWeight: 400,
                  color: "var(--ink)",
                }}
              >
                {t("failedTitle")}
              </h2>
              <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--ink-2)" }}>
                {job.error ?? t("unknownError")}
              </p>
              <button
                type="button"
                onClick={reset}
                style={{
                  padding: "10px 18px",
                  borderRadius: 999,
                  background: "var(--terra)",
                  color: "var(--paper)",
                  border: 0,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {t("tryAgain")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
