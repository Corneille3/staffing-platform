"use client";

import { useState } from "react";
import { ScanSearch, Trash2 } from "lucide-react";
import { OrphanUserCleanup } from "./orphan-user-cleanup";
import { removeOrphan, scanOrphans } from "../lib/browser-api";
import type { OrphanAccount, OrphanScanResult } from "../lib/types";

function fmtDateTime(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(undefined, {
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
      setError(err instanceof Error ? err.message : "Scan failed");
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
      setError(err instanceof Error ? err.message : "Removal failed");
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
              Diffs Clerk accounts against the database. Finds uninvited sign-ups
              (Clerk account, no database row) and database rows reachable in no
              management list.
            </p>
            <button type="button" onClick={runScan} disabled={scanning} style={{ ...scanBtn, opacity: scanning ? 0.6 : 1 }}>
              <ScanSearch size={13} />
              {scanning ? "Scanning…" : result ? "Rescan" : "Scan for orphans"}
            </button>
          </div>

          {error && <p style={errorNote}>{error}</p>}
          {lastRemoved && <p style={successNote}>Removed {lastRemoved}.</p>}

          {result && (
            <div style={{ marginTop: 16 }}>
              {!result.clerk_available && (
                <p style={warnNote}>
                  Clerk scan unavailable (Backend API unreachable or no secret key) —
                  only database-side orphans are shown.
                </p>
              )}

              {total === 0 ? (
                <p style={successNote}>
                  No orphans found — {result.clerk_available ? "Clerk and the database agree" : "the database is clean"}.
                </p>
              ) : (
                <>
                  <OrphanGroup
                    title="Only in Clerk"
                    sub="Signed up but never invited, or left behind by a failed delete. No database row — removing deletes the Clerk account."
                    orphans={result.clerk_only}
                    removing={removing}
                    onRemove={remove}
                  />
                  <OrphanGroup
                    title="Only in the database"
                    sub="Holds an email but appears in no management list. Removing tombstones the row and frees the email for re-invitation."
                    orphans={result.db_only}
                    removing={removing}
                    onRemove={remove}
                  />
                </>
              )}

              <p style={{ margin: "12px 0 0", fontSize: 11, color: "var(--ink-3)" }}>
                Scanned {fmtDateTime(result.scanned_at)}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div style={{ ...card, fontSize: 13, color: "var(--ink-3)" }}>
          The orphan scan is available to owners and operators only.
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
                  {orphan.email ?? <span style={{ color: "var(--ink-3)" }}>no email on record</span>}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                  {[
                    orphan.name,
                    orphan.role,
                    orphan.created_at ? `created ${fmtDateTime(orphan.created_at)}` : null,
                    orphan.kind === "clerk"
                      ? orphan.last_sign_in_at
                        ? `last sign-in ${fmtDateTime(orphan.last_sign_in_at)}`
                        : "never signed in"
                      : orphan.clerk_linked
                        ? "Clerk-linked"
                        : "never signed up",
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
                {busy ? "Removing…" : "Remove"}
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
