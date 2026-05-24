"use client";

import { useState } from "react";
import type { ApfActivityFilter, ApfActivityRow } from "../lib/types";
import { fetchApfActivity } from "../lib/browser-api";
import { ActivityRowCard, ActivityDateHeader, groupByDate } from "./apf-activity-row";

interface Props {
  filter: ApfActivityFilter;
  initialRows: ApfActivityRow[];
  initialCursor: string | null;
  orgId?: string;
}

export function ApfActivityList({ filter, initialRows, initialCursor, orgId }: Props) {
  const [rows, setRows] = useState<ApfActivityRow[]>(initialRows);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadOlder() {
    if (!cursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchApfActivity({ filter, cursor, orgId });
      setRows((prev) => [...prev, ...page.items]);
      setCursor(page.next_cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load older activity");
    } finally {
      setLoading(false);
    }
  }

  if (rows.length === 0) {
    return <p style={{ color: "var(--ink-3)" }}>No activity recorded for this filter.</p>;
  }

  const groups = groupByDate(rows);

  return (
    <>
      {groups.map((g) => (
        <div key={g.key} style={{ marginBottom: 32 }}>
          <ActivityDateHeader label={g.label} />
          <div style={{ display: "grid", gap: 6 }}>
            {g.entries.map((row) => (
              <ActivityRowCard key={row.id} row={row} />
            ))}
          </div>
        </div>
      ))}

      {error && (
        <p style={{ color: "var(--rose)", fontSize: 13, margin: "0 0 12px" }}>{error}</p>
      )}

      {cursor && (
        <div style={{ display: "flex", justifyContent: "center", margin: "24px 0 8px" }}>
          <button
            type="button"
            onClick={loadOlder}
            disabled={loading}
            style={{
              padding: "10px 18px",
              borderRadius: 999,
              background: "transparent",
              border: "0.5px solid var(--line)",
              color: "var(--ink)",
              fontSize: 13,
              fontWeight: 500,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
              fontFamily: "var(--ui)",
            }}
          >
            {loading ? "Loading…" : "Load older →"}
          </button>
        </div>
      )}
    </>
  );
}
