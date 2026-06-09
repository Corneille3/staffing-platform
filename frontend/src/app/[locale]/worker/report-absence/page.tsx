"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "../../../../i18n/navigation";
import {
  cancelRelease,
  fetchAbsenceOptions,
  fetchReplacementStatus,
  reportAbsence,
  type ReplacementStatus,
} from "../../../../lib/browser-api";
import type { AbsenceSite } from "../../../../lib/types";
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

export default function ReportAbsencePage() {
  const { worker } = useWorkerSession();
  const t = useTranslations("worker.absence");

  const [sites, setSites] = useState<AbsenceSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [siteId, setSiteId] = useState("");
  const [role, setRole] = useState("");
  const [workDate, setWorkDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [reason, setReason] = useState<(typeof REASONS)[number]>("sick");
  const [note, setNote] = useState("");

  // post-submit waiting state
  const [reportedId, setReportedId] = useState<string | null>(null);
  const [status, setStatus] = useState<ReplacementStatus | null>(null);

  useEffect(() => {
    let alive = true;
    fetchAbsenceOptions()
      .then((d) => {
        if (!alive) return;
        setSites(d.sites);
        if (d.sites[0]) {
          setSiteId(d.sites[0].id);
          setRole(d.sites[0].allowed_roles[0] ?? "");
        }
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const site = useMemo(() => sites.find((s) => s.id === siteId) ?? null, [sites, siteId]);

  // Poll the waiting status once reported (no realtime).
  useEffect(() => {
    if (!reportedId || status?.filled) return;
    let alive = true;
    const poll = async () => {
      try {
        const s = await fetchReplacementStatus(reportedId);
        if (alive) setStatus(s);
      } catch { /* transient */ }
    };
    void poll();
    const interval = setInterval(poll, 5000);
    return () => { alive = false; clearInterval(interval); };
  }, [reportedId, status?.filled]);

  if (!worker) return null;

  async function submit() {
    if (!siteId || !role || !workDate) {
      setError(t("required"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const req = await reportAbsence({
        organization_id: siteId,
        role,
        work_date: workDate,
        start_time: startTime,
        end_time: endTime,
        reason,
        note: note.trim() || null,
      });
      setReportedId(req.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Report failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!reportedId) return;
    setBusy(true);
    try {
      await cancelRelease(reportedId);
      setReportedId(null);
      setStatus(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setBusy(false);
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

      {loading ? (
        <p style={{ color: "var(--ink-3)", fontSize: 14 }}>{t("loading")}</p>
      ) : reportedId ? (
        // ── Waiting / filled ──
        status?.filled ? (
          <Notice tone="moss">{t("filled", { name: status.claimed_by_name ?? t("someone") })}</Notice>
        ) : (
          <section style={CARD}>
            <div style={{ fontFamily: "var(--serif)", fontSize: 18, marginBottom: 4 }}>{t("waitingTitle")}</div>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>{t("waitingSub")}</p>
            <div style={{ display: "flex", gap: 18, marginBottom: 14 }}>
              <Tally value={status?.alerted ?? 0} label={t("alerted")} />
              <Tally value={status?.viewed ?? 0} label={t("viewed")} />
            </div>
            <button type="button" onClick={handleCancel} disabled={busy} style={GHOST_BTN}>
              {t("cancel")}
            </button>
          </section>
        )
      ) : sites.length === 0 ? (
        <Notice tone="muted">{t("noSites")}</Notice>
      ) : (
        // ── Form ──
        <div style={{ display: "grid", gap: 18 }}>
          <Field label={t("site")}>
            <select value={siteId} onChange={(e) => { setSiteId(e.target.value); const s = sites.find((x) => x.id === e.target.value); setRole(s?.allowed_roles[0] ?? ""); }} style={INPUT}>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.city}</option>)}
            </select>
          </Field>

          <Field label={t("role")}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {(site?.allowed_roles ?? []).map((r) => {
                const active = role === r;
                return (
                  <button key={r} type="button" onClick={() => setRole(r)} style={chip(active)}>
                    {ROLE_LABELS[r] ?? r}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label={t("date")}>
            <input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} style={INPUT} />
          </Field>

          <div style={{ display: "flex", gap: 12 }}>
            <Field label={t("start")} style={{ flex: 1 }}>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={INPUT} />
            </Field>
            <Field label={t("end")} style={{ flex: 1 }}>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={INPUT} />
            </Field>
          </div>

          <Field label={t("reason")}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {REASONS.map((r) => (
                <button key={r} type="button" onClick={() => setReason(r)} style={chip(reason === r)}>
                  {t(`reason_${r}`)}
                </button>
              ))}
            </div>
          </Field>

          <Field label={t("note")}>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ ...INPUT, resize: "vertical" }} placeholder={t("notePlaceholder")} />
          </Field>

          {error && <p style={{ margin: 0, color: "var(--rose)", fontSize: 13 }}>{error}</p>}

          <button type="button" onClick={submit} disabled={busy} style={{ ...PRIMARY_BTN, opacity: busy ? 0.6 : 1 }}>
            <Check size={15} /> {busy ? t("submitting") : t("submit")}
          </button>
        </div>
      )}
      {error && reportedId && <p style={{ margin: "10px 0 0", color: "var(--rose)", fontSize: 13 }}>{error}</p>}
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

function Tally({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 24, fontWeight: 600 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Notice({ tone, children }: { tone: "moss" | "muted"; children: React.ReactNode }) {
  const p = tone === "moss"
    ? { bg: "var(--moss-soft)", color: "var(--moss)", border: "#C8DCC1" }
    : { bg: "var(--paper-2)", color: "var(--ink-2)", border: "var(--line)" };
  return <div style={{ background: p.bg, color: p.color, border: `0.5px solid ${p.border}`, borderRadius: 12, padding: "12px 14px", fontSize: 13, fontWeight: 500 }}>{children}</div>;
}

const CARD: React.CSSProperties = { background: "var(--card)", border: "0.5px solid var(--line)", borderRadius: 18, padding: 18 };
const INPUT: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, border: "0.5px solid var(--line)", background: "var(--paper)", color: "var(--ink)", fontSize: 14, fontFamily: "var(--ui)", appearance: "none" as const };
const PRIMARY_BTN: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 48, borderRadius: 14, border: "none", background: "var(--terra)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "var(--ui)" };
const GHOST_BTN: React.CSSProperties = { width: "100%", minHeight: 44, borderRadius: 14, border: "0.5px solid var(--line)", background: "transparent", color: "var(--ink-2)", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "var(--ui)" };

function chip(active: boolean): React.CSSProperties {
  return {
    padding: "8px 14px", borderRadius: 99, border: `0.5px solid ${active ? "transparent" : "var(--line)"}`,
    background: active ? "var(--ink)" : "#fff", color: active ? "var(--paper)" : "var(--ink)",
    fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "var(--ui)", minHeight: 40,
  };
}
