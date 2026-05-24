"use client";

import { useMemo, useState } from "react";
import { Mono } from "./ui";
import { notifyWorkers } from "../lib/browser-api";
import type { AdminSubstituteRow } from "../lib/types";

const LANG_LABEL: Record<string, string> = { fr: "FR", en: "EN", bilingual: "Bilingual" };

type SortKey = "name" | "city" | "availability" | "match";

interface Props {
  rows: AdminSubstituteRow[];
  ranked: boolean;
  requestId?: string;
}

function initials(first: string, last: string): string {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

function matchAccent(score: number): string {
  if (score >= 90) return "var(--moss)";
  if (score >= 80) return "var(--terra)";
  return "var(--ink-3)";
}

function availabilityLabel(row: AdminSubstituteRow): string {
  const status = row.worker.profile?.availability_status ?? "unknown";
  if (status === "available") return "Available";
  if (status === "unavailable") return "Unavailable";
  return "—";
}

export function AdminSubstitutesTable({ rows, ranked, requestId }: Props) {
  const [notified, setNotified] = useState<Record<string, "busy" | "done">>({});

  async function notify(workerId: string) {
    if (!requestId) return;
    setNotified((p) => ({ ...p, [workerId]: "busy" }));
    try {
      await notifyWorkers(requestId, [workerId]);
      setNotified((p) => ({ ...p, [workerId]: "done" }));
    } catch {
      setNotified((p) => {
        const n = { ...p };
        delete n[workerId];
        return n;
      });
    }
  }

  const [sortKey, setSortKey] = useState<SortKey>(ranked ? "match" : "name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(ranked ? "desc" : "asc");

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "match") {
        cmp = (a.match_score ?? -1) - (b.match_score ?? -1);
      } else if (sortKey === "city") {
        const aCity = a.worker.profile?.supported_cities[0] ?? "";
        const bCity = b.worker.profile?.supported_cities[0] ?? "";
        cmp = aCity.localeCompare(bCity);
      } else if (sortKey === "availability") {
        cmp = availabilityLabel(a).localeCompare(availabilityLabel(b));
      } else {
        cmp = `${a.worker.first_name} ${a.worker.last_name}`.localeCompare(
          `${b.worker.first_name} ${b.worker.last_name}`,
        );
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function clickSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "match" ? "desc" : "asc");
    }
  }

  return (
    <div
      style={{
        background: "var(--card)",
        border: "0.5px solid var(--line)",
        borderRadius: "var(--r-lg)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1.2fr 1.4fr 1fr 1fr 90px",
          padding: "12px 18px",
          borderBottom: "0.5px solid var(--line)",
          fontSize: 10,
          color: "var(--ink-3)",
          letterSpacing: ".18em",
          textTransform: "uppercase",
          fontWeight: 500,
        }}
      >
        <SortableHeader label="Substitute" active={sortKey === "name"} dir={sortDir} onClick={() => clickSort("name")} />
        <SortableHeader label="City" active={sortKey === "city"} dir={sortDir} onClick={() => clickSort("city")} />
        <SortableHeader label="Availability" active={sortKey === "availability"} dir={sortDir} onClick={() => clickSort("availability")} />
        <div>Languages</div>
        <SortableHeader label="Match" active={sortKey === "match"} dir={sortDir} onClick={() => clickSort("match")} disabled={!ranked} />
        <div></div>
      </div>

      {sorted.length === 0 ? (
        <p style={{ margin: 0, padding: "24px 18px", color: "var(--ink-3)", fontSize: 13 }}>
          No substitutes in the pool yet.
        </p>
      ) : (
        sorted.map((row, i) => {
          const profile = row.worker.profile;
          const score = row.match_score;
          const isTop = ranked && i === 0 && (score ?? 0) >= 90;
          const cities = profile?.supported_cities ?? [];
          return (
            <div
              key={row.worker.id}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1.2fr 1.4fr 1fr 1fr 90px",
                padding: "14px 18px",
                borderBottom: i < sorted.length - 1 ? "0.5px solid var(--line-soft)" : "none",
                background: isTop ? "var(--moss-soft)" : "transparent",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    flexShrink: 0,
                    borderRadius: 99,
                    background: profile?.availability_status === "available" ? "var(--paper-2)" : "var(--line-soft)",
                    color: "var(--ink)",
                    fontSize: 12,
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {initials(row.worker.first_name, row.worker.last_name)}
                </div>
                <div style={{ lineHeight: 1.2, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.worker.first_name} {row.worker.last_name}
                    {isTop && (
                      <span
                        style={{
                          padding: "1px 6px",
                          borderRadius: 999,
                          background: "var(--terra)",
                          color: "var(--paper)",
                          fontSize: 9,
                          fontWeight: 600,
                          letterSpacing: ".06em",
                          textTransform: "uppercase",
                        }}
                      >
                        Top
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--ink-3)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.worker.email}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 13, color: "var(--ink)" }}>
                {cities.length === 0
                  ? <span style={{ color: "var(--ink-3)" }}>—</span>
                  : cities[0]}
                {cities.length > 1 && (
                  <span style={{ marginLeft: 4, color: "var(--ink-3)", fontSize: 11 }}>
                    +{cities.length - 1}
                  </span>
                )}
              </div>

              <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 99,
                    background:
                      profile?.availability_status === "available"
                        ? "var(--moss)"
                        : profile?.availability_status === "unavailable"
                          ? "var(--rose)"
                          : "var(--ink-4)",
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: "var(--ink)" }}>{availabilityLabel(row)}</span>
              </div>

              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                <span
                  style={{
                    padding: "2px 6px",
                    background: "var(--paper)",
                    border: "0.5px solid var(--line)",
                    borderRadius: 4,
                    fontSize: 10,
                    fontFamily: "var(--mono)",
                    color: "var(--ink)",
                    letterSpacing: ".04em",
                  }}
                >
                  {LANG_LABEL[row.worker.preferred_language] ?? row.worker.preferred_language.toUpperCase()}
                </span>
              </div>

              {ranked && typeof score === "number" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 50,
                      height: 5,
                      background: "var(--paper-2)",
                      borderRadius: 99,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${score}%`,
                        background: matchAccent(score),
                      }}
                    />
                  </div>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 500, color: "var(--ink)" }}>
                    {score}
                  </span>
                </div>
              ) : (
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>—</span>
              )}

              {(() => {
                const state = notified[row.worker.id];
                const disabled = !requestId || state === "busy" || state === "done";
                return (
                  <button
                    type="button"
                    onClick={() => notify(row.worker.id)}
                    disabled={disabled}
                    title={requestId ? "Add to this request's notification batch" : "Open from a request to notify"}
                    style={{
                      padding: "6px 12px",
                      fontSize: 11,
                      borderRadius: 999,
                      background: state === "done" ? "var(--moss-soft)" : "transparent",
                      border: `0.5px solid ${state === "done" ? "#C8DCC1" : "var(--line)"}`,
                      color: state === "done" ? "var(--moss)" : requestId ? "var(--ink-2)" : "var(--ink-4)",
                      cursor: disabled ? "default" : "pointer",
                      opacity: !requestId ? 0.5 : 1,
                      justifySelf: "end",
                      fontFamily: "var(--ui)",
                    }}
                    aria-label={`Notify ${row.worker.first_name}`}
                  >
                    {state === "busy" ? "…" : state === "done" ? "Notified" : "Notify"}
                  </button>
                );
              })()}
            </div>
          );
        })
      )}
    </div>
  );
}

function SortableHeader({
  label,
  active,
  dir,
  onClick,
  disabled,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        background: "transparent",
        border: 0,
        padding: 0,
        textAlign: "left",
        color: active ? "var(--ink)" : "var(--ink-3)",
        fontSize: 10,
        letterSpacing: ".18em",
        textTransform: "uppercase",
        fontWeight: 500,
        cursor: disabled ? "default" : "pointer",
        fontFamily: "var(--ui)",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
      {active && (
        <span style={{ marginLeft: 4, fontFamily: "var(--mono)" }}>
          <Mono>{dir === "asc" ? "↑" : "↓"}</Mono>
        </span>
      )}
    </button>
  );
}
