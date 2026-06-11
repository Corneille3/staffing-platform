"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "../../../../i18n/navigation";
import {
  cancelRelease,
  fetchAbsenceOptions,
  fetchMyAbsenceReports,
  reportAbsence,
} from "../../../../lib/browser-api";
import type { AbsenceSite, MyAbsenceItem } from "../../../../lib/types";
import { useWorkerSession } from "../../../../lib/worker-session";

const ROLE_LABELS: Record<string, string> = {
  educator: "Éducatrice",
  assistant_educator: "Aide-éducatrice",
  psw: "PAB / PSW",
  nurse: "Infirmière",
  food_handler: "Cuisine",
  other: "Autre",
};
const REASONS = ["sick", "family", "personal", "other"] as const;

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  searching: { bg: "var(--terra-soft)", color: "var(--terra-ink)" },
  filled: { bg: "var(--moss-soft)", color: "var(--moss)" },
  unfilled: { bg: "var(--rose-soft)", color: "var(--rose)" },
  cancelled: { bg: "var(--paper-2)", color: "var(--ink-3)" },
};

function fmtDate(value: string): string {
  try {
    return new Date(value).toLocaleDateString("fr-CA", { weekday: "short", month: "short", day: "numeric" });
  } catch {
    return value;
  }
}

export default function ReportAbsencePage() {
  const { worker } = useWorkerSession();
  const t = useTranslations("worker.absence");

  const [sites, setSites] = useState<AbsenceSite[]>([]);
  const [reports, setReports] = useState<MyAbsenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [siteId, setSiteId] = useState("");
  const [role, setRole] = useState("");
  const [workDate, setWorkDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [reason, setReason] = useState<(typeof REASONS)[number]>("sick");
  const [note, setNote] = useState("");

  async function loadReports() {
    const { items } = await fetchMyAbsenceReports();
    setReports(items);
    return items;
  }

  useEffect(() => {
    let alive = true;
    Promise.all([fetchAbsenceOptions(), fetchMyAbsenceReports()])
      .then(([opts, mine]) => {
        if (!alive) return;
        setSites(opts.sites);
        if (opts.sites[0]) {
          setSiteId(opts.sites[0].id);
          setRole(opts.sites[0].allowed_roles[0] ?? "");
        }
        setReports(mine.items);
        setShowForm(mine.items.length === 0); // no reports yet → open the form
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const hasSearching = reports.some((r) => r.status === "searching");

  // Poll while anything is still searching (no realtime).
  useEffect(() => {
    if (!hasSearching) return;
    const interval = setInterval(() => { void loadReports(); }, 8000);
    return () => clearInterval(interval);
  }, [hasSearching]);

  const site = useMemo(() => sites.find((s) => s.id === siteId) ?? null, [sites, siteId]);

  if (!worker) return null;

  async function submit() {
    if (!siteId || !role || !workDate) {
      setError(t("required"));
      return;
    }
    // The shift must still be ahead (the backend enforces the same, keyed on
    // the start — once it's started, the coordinator handles it).
    if (new Date(`${workDate}T${startTime}`) <= new Date()) {
      setError(t("pastDate"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await reportAbsence({
        organization_id: siteId,
        role,
        work_date: workDate,
        start_time: startTime,
        end_time: endTime,
        reason,
        note: note.trim() || null,
      });
      await loadReports();
      setShowForm(false);
      setWorkDate("");
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Report failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(id: string) {
    setCancelingId(id);
    setError(null);
    try {
      await cancelRelease(id);
      await loadReports();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setCancelingId(null);
    }
  }

  return (
    <div style={{ paddingTop: 16, paddingBottom: 40 }}>
      <Link href="/worker" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ink-2)", textDecoration: "none", fontSize: 14, padding: "8px 4px" }}>
        <ArrowLeft size={16} /> {t("back")}
      </Link>

      <h1 style={{ fontFamily: "var(--serif)", fontSize: 28, lineHeight: 1.05, margin: "8px 0 4px" }}>
        {t("title")}
      </h1>
      <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
        {t("sub")}
      </p>

      {error && <p style={{ margin: "0 0 14px", color: "var(--rose)", fontSize: 13 }}>{error}</p>}

      {loading ? (
        <p style={{ color: "var(--ink-3)", fontSize: 14 }}>{t("loading")}</p>
      ) : (
        <>
          {/* ── My reported absences (persists across navigation) ── */}
          {reports.length > 0 && (
            <section style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 500, marginBottom: 10 }}>
                {t("yourReports")}
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {reports.map((r) => {
                  const s = STATUS_STYLE[r.status] ?? STATUS_STYLE.searching;
                  const label =
                    r.status === "filled" ? t("st_filled", { name: r.claimed_by_name ?? t("someone") })
                    : r.status === "unfilled" ? t("st_unfilled")
                    : r.status === "cancelled" ? t("st_cancelled")
                    : t("st_searching");
                  return (
                    <div key={r.request_id} style={CARD}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>
                          {r.role ? ROLE_LABELS[r.role] ?? r.role : r.title}
                        </div>
                        <span style={{ flexShrink: 0, padding: "3px 9px", borderRadius: 99, background: s.bg, color: s.color, fontSize: 11, fontWeight: 600 }}>
                          {label}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>
                        {fmtDate(r.work_date)} · {r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)}
                      </div>
                      {r.status === "searching" && (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
                          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                            {r.alerted} {t("alerted")} · {r.viewed} {t("viewed")}
                          </span>
                          <button type="button" onClick={() => handleCancel(r.request_id)} disabled={cancelingId === r.request_id}
                            style={{ padding: "6px 12px", borderRadius: 99, border: "0.5px solid var(--line)", background: "transparent", color: "var(--ink-2)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--ui)" }}>
                            {t("cancel")}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Form (toggle when there are existing reports) ── */}
          {!showForm ? (
            <button type="button" onClick={() => setShowForm(true)} style={{ ...PRIMARY_BTN, width: "100%" }}>
              {t("reportAnother")}
            </button>
          ) : sites.length === 0 ? (
            <Notice tone="muted">{t("noSites")}</Notice>
          ) : (
            <div style={{ display: "grid", gap: 18 }}>
              <Field label={t("site")}>
                <select value={siteId} onChange={(e) => { setSiteId(e.target.value); const s = sites.find((x) => x.id === e.target.value); setRole(s?.allowed_roles[0] ?? ""); }} style={INPUT}>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.city}</option>)}
                </select>
              </Field>
              <Field label={t("role")}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {(site?.allowed_roles ?? []).map((r) => (
                    <button key={r} type="button" onClick={() => setRole(r)} style={chip(role === r)}>{ROLE_LABELS[r] ?? r}</button>
                  ))}
                </div>
              </Field>
              <Field label={t("date")}>
                <input type="date" min={new Date().toLocaleDateString("en-CA")} value={workDate} onChange={(e) => setWorkDate(e.target.value)} style={INPUT} />
              </Field>
              <div style={{ display: "flex", gap: 12 }}>
                <Field label={t("start")} style={{ flex: 1 }}><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={INPUT} /></Field>
                <Field label={t("end")} style={{ flex: 1 }}><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={INPUT} /></Field>
              </div>
              <Field label={t("reason")}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {REASONS.map((r) => <button key={r} type="button" onClick={() => setReason(r)} style={chip(reason === r)}>{t(`reason_${r}`)}</button>)}
                </div>
              </Field>
              <Field label={t("note")}>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ ...INPUT, resize: "vertical" }} placeholder={t("notePlaceholder")} />
              </Field>
              <button type="button" onClick={submit} disabled={busy} style={{ ...PRIMARY_BTN, opacity: busy ? 0.6 : 1 }}>
                <Check size={15} /> {busy ? t("submitting") : t("submit")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <label style={{ display: "grid", gap: 6, ...style }}>
      <span style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 500 }}>{label}</span>
      {children}
    </label>
  );
}

function Notice({ tone, children }: { tone: "moss" | "muted"; children: React.ReactNode }) {
  const p = tone === "moss"
    ? { bg: "var(--moss-soft)", color: "var(--moss)", border: "#C8DCC1" }
    : { bg: "var(--paper-2)", color: "var(--ink-2)", border: "var(--line)" };
  return <div style={{ background: p.bg, color: p.color, border: `0.5px solid ${p.border}`, borderRadius: 12, padding: "12px 14px", fontSize: 13, fontWeight: 500 }}>{children}</div>;
}

const CARD: React.CSSProperties = { background: "var(--card)", border: "0.5px solid var(--line)", borderRadius: 16, padding: "14px 16px" };
const INPUT: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, border: "0.5px solid var(--line)", background: "var(--paper)", color: "var(--ink)", fontSize: 14, fontFamily: "var(--ui)", appearance: "none" as const };
const PRIMARY_BTN: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 48, borderRadius: 14, border: "none", background: "var(--terra)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "var(--ui)" };

function chip(active: boolean): React.CSSProperties {
  return {
    padding: "8px 14px", borderRadius: 99, border: `0.5px solid ${active ? "transparent" : "var(--line)"}`,
    background: active ? "var(--ink)" : "#fff", color: active ? "var(--paper)" : "var(--ink)",
    fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "var(--ui)", minHeight: 40,
  };
}
