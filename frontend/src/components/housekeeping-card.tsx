"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ScanSearch, Trash2 } from "lucide-react";
import { OrphanUserCleanup } from "./orphan-user-cleanup";
import { removeOrphan, scanOrphans } from "../lib/browser-api";
import type { OrphanAccount, OrphanScanResult } from "../lib/types";

function fmtDateTime(value: string | null, locale: string): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(locale === "fr" ? "fr-CA" : "en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

/** Housekeeping section: scan Clerk + the database for orphan accounts and
 * clean them up one click at a time. The manual force-remove-by-email form
 * stays below as the fallback for anything the scan can't see. */
export function HousekeepingCard({ canScan }: { canScan: boolean }) {
  const t = useTranslations("platform.housekeeping");
  const locale = useLocale();
  const [result, setResult] = useState<OrphanScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRemoved, setLastRemoved] = useState<string | null>(null);

  async function runScan() {
    setScanning(true);
    setError(null);
    setLastRemoved(null);
    try {
      setResult(await scanOrphans());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("scanFailed"));
    } finally {
      setScanning(false);
    }
  }

  async function remove(orphan: OrphanAccount) {
    setRemoving(`${orphan.kind}:${orphan.id}`);
    setError(null);
    setLastRemoved(null);
    try {
      // The backend re-verifies orphan-hood and returns a fresh scan.
      setResult(await removeOrphan(orphan.kind, orphan.id));
      setLastRemoved(orphan.email ?? orphan.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("removeFailed"));
    } finally {
      setRemoving(null);
    }
  }

  const total = result ? result.clerk_only.length + result.db_only.length : 0;

  return (
    <div>
      {canScan ? (
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5, maxWidth: 560 }}>
              {t("intro")}
            </p>
            <button type="button" onClick={runScan} disabled={scanning} style={{ ...scanBtn, opacity: scanning ? 0.6 : 1 }}>
              <ScanSearch size={13} />
              {scanning ? t("scanning") : result ? t("rescan") : t("scan")}
            </button>
          </div>

          {error && <p style={errorNote}>{error}</p>}
          {lastRemoved && <p style={successNote}>{t("removed", { who: lastRemoved })}</p>}

          {result && (
            <div style={{ marginTop: 16 }}>
              {!result.clerk_available && (
                <p style={warnNote}>
                  {t("clerkUnavailable")}
                </p>
              )}

              {total === 0 ? (
                <p style={successNote}>
                  {result.clerk_available ? t("noneClerk") : t("noneDb")}
                </p>
              ) : (
                <>
                  <OrphanGroup
                    title={t("clerkTitle")}
                    sub={t("clerkSub")}
                    orphans={result.clerk_only}
                    removing={removing}
                    onRemove={remove}
                  />
                  <OrphanGroup
                    title={t("dbTitle")}
                    sub={t("dbSub")}
                    orphans={result.db_only}
                    removing={removing}
                    onRemove={remove}
                  />
                </>
              )}

              <p style={{ margin: "12px 0 0", fontSize: 11, color: "var(--ink-3)" }}>
                {t("scanned", { time: fmtDateTime(result.scanned_at, locale) })}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div style={{ ...card, fontSize: 13, color: "var(--ink-3)" }}>
          {t("hidden")}
        </div>
      )}

      <OrphanUserCleanup />
    </div>
  );
}

function OrphanGroup({
  title,
  sub,
  orphans,
  removing,
  onRemove,
}: {
  title: string;
  sub: string;
  orphans: OrphanAccount[];
  removing: string | null;
  onRemove: (orphan: OrphanAccount) => void;
}) {
  const t = useTranslations("platform.housekeeping");
  const locale = useLocale();
  if (orphans.length === 0) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--ink-3)" }}>{orphans.length}</span>
      </div>
      <p style={{ margin: "3px 0 10px", fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.45 }}>{sub}</p>
      <div style={{ border: "0.5px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
        {orphans.map((orphan, i) => {
          const key = `${orphan.kind}:${orphan.id}`;
          const busy = removing === key;
          return (
            <div
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "10px 14px",
                borderTop: i === 0 ? "none" : "0.5px solid var(--line)",
                background: "var(--paper)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {orphan.email ?? <span style={{ color: "var(--ink-3)" }}>{t("noEmail")}</span>}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                  {[
                    orphan.name,
                    orphan.role,
                    orphan.created_at ? t("created", { time: fmtDateTime(orphan.created_at, locale) }) : null,
                    orphan.kind === "clerk"
                      ? orphan.last_sign_in_at
                        ? t("lastSignIn", { time: fmtDateTime(orphan.last_sign_in_at, locale) })
                        : t("neverSignedIn")
                      : orphan.clerk_linked
                        ? t("clerkLinked")
                        : t("neverSignedUp"),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRemove(orphan)}
                disabled={removing !== null}
                style={{ ...removeBtn, opacity: removing !== null && !busy ? 0.45 : 1, cursor: removing !== null ? "not-allowed" : "pointer" }}
              >
                <Trash2 size={12} />
                {busy ? t("removing") : t("remove")}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  padding: "18px 20px",
  background: "var(--card)",
  border: "0.5px solid var(--line)",
  borderRadius: 14,
};

const scanBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "9px 18px",
  borderRadius: 999,
  background: "var(--ink)",
  border: "none",
  color: "#fff",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "var(--ui)",
  whiteSpace: "nowrap",
};

const removeBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 14px",
  borderRadius: 999,
  background: "transparent",
  border: "0.5px solid var(--rose)",
  color: "var(--rose)",
  fontSize: 11.5,
  fontWeight: 500,
  fontFamily: "var(--ui)",
  whiteSpace: "nowrap",
};

const errorNote: React.CSSProperties = {
  margin: "12px 0 0",
  padding: "8px 12px",
  borderRadius: 8,
  background: "var(--terra-soft)",
  color: "var(--terra-ink)",
  fontSize: 12,
  lineHeight: 1.45,
};

const successNote: React.CSSProperties = {
  margin: "12px 0 0",
  padding: "8px 12px",
  borderRadius: 8,
  background: "var(--moss-soft)",
  color: "var(--moss)",
  fontSize: 12,
  lineHeight: 1.45,
};

const warnNote: React.CSSProperties = {
  margin: "0 0 10px",
  padding: "8px 12px",
  borderRadius: 8,
  background: "var(--sand-soft)",
  color: "var(--ink-2)",
  fontSize: 12,
  lineHeight: 1.45,
};
