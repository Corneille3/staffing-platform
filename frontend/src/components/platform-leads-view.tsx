"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Download, Plus, Search, Upload } from "lucide-react";
import { Link, useRouter } from "../i18n/navigation";
import { createLead, fetchLeadsPage, importLeads } from "../lib/browser-api";
import {
  LEAD_KINDS,
  LEAD_PROVINCES,
  LEAD_SEGMENTS,
  LEAD_SORTS,
  LEAD_STATUSES,
  LEAD_WAVES,
  formatDay,
  isLeadOverdue,
  leadsQuery,
  leadsToCsv,
  type LeadFilters,
} from "../lib/leads";
import type { Lead, LeadImportResult, LeadListResponse, LeadStats } from "../lib/types";
import {
  LeadFieldLabel,
  LeadKindBadge,
  LeadModal,
  LeadStatusChip,
  leadCard,
  leadEyebrow,
  leadGhostBtn,
  leadInput,
  leadPrimaryBtn,
  leadRowBtn,
} from "./platform-leads-shared";

const GRID = "2.4fr 1.2fr 0.5fr 1.1fr 0.5fr 0.5fr 0.5fr 1.1fr 1.6fr 0.9fr";
const BASE_PATH = "/platform/leads";

export function PlatformLeadsView({
  data,
  stats,
  filters,
  todayKey,
}: {
  data: LeadListResponse;
  stats: LeadStats;
  filters: LeadFilters;
  // Today in the shift timezone (YYYY-MM-DD), computed by the server page so
  // "overdue" matches the backend's counter exactly.
  todayKey: string;
}) {
  const t = useTranslations("platform.leads");
  const locale = useLocale();
  const router = useRouter();
  const [importOpen, setImportOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const [search, setSearch] = useState(filters.q ?? "");
  const firstRender = useRef(true);

  function go(next: LeadFilters) {
    router.replace(`${BASE_PATH}${leadsQuery(next)}`);
  }

  function setFilter(key: keyof LeadFilters, value: string) {
    go({ ...filters, [key]: value || undefined, page: 1 });
  }

  // Debounced search → URL. Skips the first render so opening the page with
  // ?q= already set does not navigate again.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const handle = setTimeout(() => {
      if ((filters.q ?? "") !== search.trim()) go({ ...filters, q: search.trim() || undefined, page: 1 });
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const page = filters.page ?? 1;
  const from = data.total === 0 ? 0 : data.offset + 1;
  const to = data.offset + data.items.length;
  const hasFilters = !!(filters.status || filters.segment || filters.province || filters.wave || filters.kind || filters.q);

  async function exportCsv() {
    setExporting(true);
    setExportError(false);
    try {
      // Walk every page of the current filters, not just the one on screen.
      const all: Lead[] = [];
      for (let p = 1; p <= 200; p++) {
        const chunk = await fetchLeadsPage(leadsQuery({ ...filters, page: p }, true));
        all.push(...chunk.items);
        if (all.length >= chunk.total || chunk.items.length === 0) break;
      }
      const f = (key: string) => t(`field.${key}`);
      const csv = leadsToCsv(all, [
        { header: f("external_ref"), value: (l) => l.external_ref },
        { header: f("org_name"), value: (l) => l.org_name },
        { header: f("segment"), value: (l) => t(`segment.${l.segment}`) },
        { header: f("subtype"), value: (l) => l.subtype },
        { header: f("kind"), value: (l) => t(`kind.${l.kind}`) },
        { header: f("site_count"), value: (l) => l.site_count },
        { header: f("capacity_note"), value: (l) => l.capacity_note },
        { header: f("city"), value: (l) => l.city },
        { header: f("province"), value: (l) => l.province },
        { header: f("regions"), value: (l) => l.regions },
        { header: f("agency_ban_phase"), value: (l) => (l.agency_ban_phase === "none" ? "" : l.agency_ban_phase) },
        { header: f("language"), value: (l) => l.language.toUpperCase() },
        { header: f("website"), value: (l) => l.website },
        { header: f("phone"), value: (l) => l.phone },
        { header: f("email"), value: (l) => l.email },
        { header: f("contact_name"), value: (l) => l.contact_name },
        { header: f("contact_title"), value: (l) => l.contact_title },
        { header: f("score"), value: (l) => l.score },
        { header: f("wave"), value: (l) => l.wave },
        { header: t("list.colStatus"), value: (l) => t(`status.${l.status}`) },
        { header: f("source"), value: (l) => t(`source.${l.source}`) },
        { header: f("next_action"), value: (l) => l.next_action },
        { header: f("next_action_at"), value: (l) => l.next_action_at },
        { header: f("notes"), value: (l) => l.notes },
        { header: f("source_url"), value: (l) => l.source_url },
      ]);
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `staffig-leads-${todayKey}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  }

  const conversion = stats.conversion_rate == null ? null : Math.round(stats.conversion_rate * 100);

  return (
    <div style={{ padding: "32px 36px", maxWidth: 1360 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={leadEyebrow}>{t("list.eyebrow")}</div>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: "clamp(2rem, 4vw, 2.75rem)", lineHeight: 1.02, margin: "6px 0 0", letterSpacing: "-0.02em", fontWeight: 400 }}>
            {t("list.title", { count: stats.total })} <em style={{ fontStyle: "italic" }}>{t("list.titleEm")}</em>
          </h1>
          <p style={{ margin: "8px 0 0", color: "var(--ink-2)", fontSize: 14, maxWidth: 600 }}>{t("list.intro")}</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setImportOpen(true)} style={leadGhostBtn}>
            <Upload size={14} /> {t("list.import")}
          </button>
          <button type="button" onClick={exportCsv} disabled={exporting || data.total === 0} style={{ ...leadGhostBtn, opacity: exporting || data.total === 0 ? 0.5 : 1 }}>
            <Download size={14} /> {exporting ? t("list.exporting") : t("list.export")}
          </button>
          <button type="button" onClick={() => setNewOpen(true)} style={leadPrimaryBtn}>
            <Plus size={15} /> {t("list.newLead")}
          </button>
        </div>
      </div>
      {exportError ? (
        <p role="alert" style={{ margin: "-8px 0 14px", color: "var(--rose)", fontSize: 12, textAlign: "right" }}>
          {t("list.exportFailed")}
        </p>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 24 }}>
        <Tile label={t("list.tileOpen")} value={String(stats.open_pipeline)} sub={t("list.tileOpenSub")} />
        <Tile
          label={t("list.tileOverdue")}
          value={String(stats.overdue_actions)}
          sub={t("list.tileOverdueSub")}
          tone={stats.overdue_actions > 0 ? "terra" : undefined}
        />
        <Tile label={t("list.tileDemo")} value={String(stats.in_demo_or_pilot)} sub={t("list.tileDemoSub")} />
        <Tile
          label={t("list.tileConversion")}
          value={conversion == null ? "—" : String(conversion)}
          unit={conversion == null ? undefined : "%"}
          sub={t("list.tileConversionSub")}
          tone="moss"
        />
      </div>

      {/* Filters — every one of them lives in the URL */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <label style={{ position: "relative", flex: "1 1 220px", maxWidth: 320 }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)" }} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("list.search")}
            aria-label={t("list.search")}
            style={{ ...leadInput, paddingLeft: 34, background: "#fff", fontSize: 13 }}
          />
        </label>
        <FilterSelect value={filters.status} onChange={(v) => setFilter("status", v)} all={t("list.allStatuses")}
          options={LEAD_STATUSES.map((s) => [s, t(`status.${s}`)])} />
        <FilterSelect value={filters.segment} onChange={(v) => setFilter("segment", v)} all={t("list.allSegments")}
          options={LEAD_SEGMENTS.map((s) => [s, t(`segment.${s}`)])} />
        <FilterSelect value={filters.province} onChange={(v) => setFilter("province", v)} all={t("list.allProvinces")}
          options={LEAD_PROVINCES.map((p) => [p, p])} />
        <FilterSelect value={filters.wave} onChange={(v) => setFilter("wave", v)} all={t("list.allWaves")}
          options={LEAD_WAVES.map((w) => [w, t("list.wave", { wave: w })])} />
        <FilterSelect value={filters.kind} onChange={(v) => setFilter("kind", v)} all={t("list.allKinds")}
          options={LEAD_KINDS.map((k) => [k, t(`kind.${k}`)])} />
        <div style={{ flex: 1 }} />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-3)" }}>
          {t("list.sortLabel")}
          <select
            value={filters.sort ?? "next_action"}
            onChange={(e) => setFilter("sort", e.target.value)}
            style={selectStyle}
          >
            {LEAD_SORTS.map((s) => (
              <option key={s} value={s}>{t(`list.sort_${s}`)}</option>
            ))}
          </select>
        </label>
        {hasFilters ? (
          <button type="button" onClick={() => { setSearch(""); go({ sort: filters.sort }); }} style={leadRowBtn}>
            {t("list.clear")}
          </button>
        ) : null}
      </div>

      <div style={{ ...leadCard, padding: 0, overflowX: "auto" }}>
        <div style={{ minWidth: 1080 }}>
          <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 10, padding: "12px 22px", borderBottom: "0.5px solid var(--line)", fontSize: 10, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 500 }}>
            <div>{t("list.colOrg")}</div>
            <div>{t("list.colSegment")}</div>
            <div>{t("list.colSites")}</div>
            <div>{t("list.colCity")}</div>
            <div>{t("list.colPhase")}</div>
            <div>{t("list.colScore")}</div>
            <div>{t("list.colWave")}</div>
            <div>{t("list.colStatus")}</div>
            <div>{t("list.colNext")}</div>
            <div>{t("list.colDate")}</div>
          </div>
          {data.items.length === 0 ? (
            <div style={{ padding: "28px 22px", fontSize: 13, color: "var(--ink-3)" }}>
              {hasFilters ? t("list.emptyFiltered") : t("list.empty")}
            </div>
          ) : (
            data.items.map((lead, i) => (
              <LeadRow key={lead.id} lead={lead} last={i === data.items.length - 1} todayKey={todayKey} locale={locale} />
            ))
          )}
        </div>
      </div>

      {data.total > 0 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, fontSize: 12, color: "var(--ink-3)" }}>
          <span style={{ fontFamily: "var(--mono)" }}>{t("list.range", { from, to, total: data.total })}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" disabled={page <= 1} onClick={() => go({ ...filters, page: page - 1 })} style={{ ...leadRowBtn, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? "default" : "pointer" }}>
              {t("list.prev")}
            </button>
            <button type="button" disabled={to >= data.total} onClick={() => go({ ...filters, page: page + 1 })} style={{ ...leadRowBtn, opacity: to >= data.total ? 0.4 : 1, cursor: to >= data.total ? "default" : "pointer" }}>
              {t("list.next")}
            </button>
          </div>
        </div>
      ) : null}

      {importOpen ? (
        <ImportModal onClose={() => { setImportOpen(false); router.refresh(); }} />
      ) : null}
      {newOpen ? (
        <NewLeadModal onClose={() => setNewOpen(false)} onCreated={(lead) => router.push(`${BASE_PATH}/${lead.id}`)} />
      ) : null}
    </div>
  );
}

function LeadRow({ lead, last, todayKey, locale }: { lead: Lead; last: boolean; todayKey: string; locale: string }) {
  const t = useTranslations("platform.leads");
  const overdue = isLeadOverdue(lead, todayKey);
  return (
    <Link href={`${BASE_PATH}/${lead.id}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: GRID,
          gap: 10,
          padding: "13px 22px",
          alignItems: "center",
          borderBottom: last ? "none" : "0.5px solid var(--line)",
          fontSize: 13,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
            <span style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.org_name}</span>
            <LeadKindBadge kind={lead.kind} />
          </div>
          {lead.subtype ? (
            <div style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.subtype}</div>
          ) : null}
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-2)" }}>{t(`segment.${lead.segment}`)}</div>
        <div style={{ fontFamily: "var(--mono)" }}>{lead.site_count ?? "—"}</div>
        <div style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {lead.city ? `${lead.city}, ` : ""}
          <span style={{ color: "var(--ink-3)" }}>{lead.province}</span>
        </div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: lead.agency_ban_phase === "none" ? "var(--ink-4)" : "var(--ink)" }}>
          {t(`phase.${lead.agency_ban_phase}`)}
        </div>
        <div style={{ fontFamily: "var(--mono)", color: scoreColor(lead.score) }}>{lead.score ?? "—"}</div>
        <div style={{ fontFamily: "var(--mono)", color: lead.wave ? "var(--ink)" : "var(--ink-4)" }}>{lead.wave ?? "—"}</div>
        <div><LeadStatusChip status={lead.status} /></div>
        <div style={{ minWidth: 0, fontSize: 12, color: lead.next_action ? "var(--ink-2)" : "var(--ink-4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {lead.next_action ?? "—"}
        </div>
        <div style={{ fontSize: 12 }}>
          {lead.next_action_at ? (
            <span style={{ color: overdue ? "var(--rose)" : "var(--ink-2)", fontWeight: overdue ? 600 : 400 }}>
              {formatDay(lead.next_action_at, locale)}
              {overdue ? <span style={{ display: "block", fontSize: 10 }}>{t("list.overdue")}</span> : null}
            </span>
          ) : (
            <span style={{ color: "var(--ink-4)" }}>—</span>
          )}
        </div>
      </div>
    </Link>
  );
}

function scoreColor(score: number | null): string {
  if (score == null) return "var(--ink-4)";
  if (score >= 7) return "var(--moss)";
  if (score >= 5) return "var(--ink)";
  return "var(--ink-3)";
}

function Tile({ label, value, unit, sub, tone }: { label: string; value: string; unit?: string; sub: string; tone?: "moss" | "terra" }) {
  const color = tone === "moss" ? "var(--moss)" : tone === "terra" ? "var(--terra)" : "var(--ink)";
  return (
    <div style={{ ...leadCard, padding: "18px 20px" }}>
      <div style={leadEyebrow}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 10 }}>
        <span style={{ fontFamily: "var(--serif)", fontSize: 36, lineHeight: 1, color, letterSpacing: "-0.02em" }}>{value}</span>
        {unit ? <span style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 16, color: "var(--ink-3)" }}>{unit}</span> : null}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: "var(--ink-3)", lineHeight: 1.4 }}>{sub}</div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  all,
  options,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  all: string;
  options: (readonly [string, string] | string[])[];
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      aria-label={all}
      style={{ ...selectStyle, borderColor: value ? "var(--ink)" : "var(--line)", fontWeight: value ? 500 : 400 }}
    >
      <option value="">{all}</option>
      {options.map(([code, label]) => (
        <option key={code} value={code}>{label}</option>
      ))}
    </select>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "9px 10px",
  borderRadius: 10,
  border: "0.5px solid var(--line)",
  background: "#fff",
  fontFamily: "var(--ui)",
  fontSize: 12.5,
  color: "var(--ink)",
  outline: "none",
  maxWidth: 190,
};

// ── Import ───────────────────────────────────────────────────────────────────

function ImportModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("platform.leads.importModal");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LeadImportResult | null>(null);

  async function run() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await importLeads(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <LeadModal eyebrow={t("eyebrow")} title={t("title")} titleEm={t("titleEm")} width={520} onClose={onClose}>
      {result ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
            <ImportCount value={result.created} label={t("created")} tone="var(--moss)" />
            <ImportCount value={result.updated} label={t("updated")} tone="var(--ink)" />
            <ImportCount value={result.unchanged} label={t("unchanged")} tone="var(--ink-3)" />
            <ImportCount value={result.skipped.length} label={t("skipped")} tone={result.skipped.length ? "var(--rose)" : "var(--ink-3)"} />
          </div>
          {result.skipped.length > 0 ? (
            <ul style={{ margin: "0 0 16px", padding: "12px 14px 12px 28px", background: "var(--rose-soft)", borderRadius: 10, fontSize: 12, color: "var(--ink)", lineHeight: 1.5, maxHeight: 180, overflowY: "auto" }}>
              {result.skipped.map((s) => (
                <li key={s.row}>{t("skippedRow", { row: s.row, reason: s.reason })}</li>
              ))}
            </ul>
          ) : null}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={leadPrimaryBtn}>{t("done")}</button>
          </div>
        </>
      ) : (
        <>
          <p style={{ margin: "0 0 18px", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>{t("intro")}</p>
          <label style={{ ...leadGhostBtn, position: "relative" }}>
            <Upload size={14} /> {t("choose")}
            <input
              type="file"
              accept=".xlsx,.csv"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }}
              style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
            />
          </label>
          <span style={{ marginLeft: 10, fontSize: 12, color: file ? "var(--ink)" : "var(--ink-3)", fontFamily: file ? "var(--mono)" : "var(--ui)" }}>
            {file ? file.name : t("noFile")}
          </span>
          {error ? <p role="alert" style={{ margin: "14px 0 0", color: "var(--rose)", fontSize: 12 }}>{error}</p> : null}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
            <button type="button" onClick={onClose} style={leadRowBtn}>{t("cancel")}</button>
            <button type="button" onClick={run} disabled={!file || busy} style={{ ...leadPrimaryBtn, opacity: !file || busy ? 0.5 : 1 }}>
              <ArrowRight size={14} /> {busy ? t("running") : t("run")}
            </button>
          </div>
        </>
      )}
    </LeadModal>
  );
}

function ImportCount({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div style={{ padding: "12px 10px", borderRadius: 10, background: "var(--paper)", textAlign: "center" }}>
      <div style={{ fontFamily: "var(--serif)", fontSize: 28, lineHeight: 1, color: tone }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 11, color: "var(--ink-3)" }}>{label}</div>
    </div>
  );
}

// ── New lead ─────────────────────────────────────────────────────────────────

function NewLeadModal({ onClose, onCreated }: { onClose: () => void; onCreated: (lead: Lead) => void }) {
  const t = useTranslations("platform.leads");
  const [orgName, setOrgName] = useState("");
  const [segment, setSegment] = useState("");
  const [province, setProvince] = useState("QC");
  const [kind, setKind] = useState("prospect");
  const [language, setLanguage] = useState("fr");
  const [city, setCity] = useState("");
  const [website, setWebsite] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!orgName.trim() || !segment || !/^[A-Za-z]{2}$/.test(province.trim())) {
      setError(t("newModal.required"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const lead = await createLead({
        org_name: orgName.trim(),
        segment,
        province: province.trim().toUpperCase(),
        kind,
        language,
        city: city.trim() || null,
        website: website.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        source: "other",
      });
      onCreated(lead);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <LeadModal eyebrow={t("newModal.eyebrow")} title={t("newModal.title")} titleEm={t("newModal.titleEm")} onClose={onClose}>
      <div style={{ marginBottom: 14 }}>
        <LeadFieldLabel>{t("field.org_name")}</LeadFieldLabel>
        <input autoFocus value={orgName} onChange={(e) => setOrgName(e.target.value)} style={leadInput} maxLength={255} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 12, marginBottom: 14 }}>
        <div>
          <LeadFieldLabel>{t("field.segment")}</LeadFieldLabel>
          <select value={segment} onChange={(e) => setSegment(e.target.value)} style={leadInput}>
            <option value="" />
            {LEAD_SEGMENTS.map((s) => <option key={s} value={s}>{t(`segment.${s}`)}</option>)}
          </select>
        </div>
        <div>
          <LeadFieldLabel>{t("field.kind")}</LeadFieldLabel>
          <select value={kind} onChange={(e) => setKind(e.target.value)} style={leadInput}>
            {LEAD_KINDS.map((k) => <option key={k} value={k}>{t(`kind.${k}`)}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 0.7fr 1fr", gap: 12, marginBottom: 14 }}>
        <div>
          <LeadFieldLabel>{t("field.city")}</LeadFieldLabel>
          <input value={city} onChange={(e) => setCity(e.target.value)} style={leadInput} maxLength={120} />
        </div>
        <div>
          <LeadFieldLabel>{t("field.province")}</LeadFieldLabel>
          <input value={province} onChange={(e) => setProvince(e.target.value.toUpperCase())} style={{ ...leadInput, fontFamily: "var(--mono)" }} maxLength={2} />
        </div>
        <div>
          <LeadFieldLabel>{t("field.language")}</LeadFieldLabel>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} style={leadInput}>
            <option value="fr">{t("language.fr")}</option>
            <option value="en">{t("language.en")}</option>
          </select>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        <div>
          <LeadFieldLabel>{t("field.email")}</LeadFieldLabel>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={leadInput} maxLength={255} />
        </div>
        <div>
          <LeadFieldLabel>{t("field.phone")}</LeadFieldLabel>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={leadInput} maxLength={60} />
        </div>
      </div>
      <div>
        <LeadFieldLabel>{t("field.website")}</LeadFieldLabel>
        <input value={website} onChange={(e) => setWebsite(e.target.value)} style={leadInput} maxLength={255} />
      </div>

      {error ? <p role="alert" style={{ margin: "12px 0 0", color: "var(--rose)", fontSize: 12 }}>{error}</p> : null}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
        <button type="button" onClick={onClose} style={leadRowBtn}>{t("newModal.cancel")}</button>
        <button type="button" onClick={submit} disabled={busy} style={{ ...leadPrimaryBtn, opacity: busy ? 0.6 : 1 }}>
          <ArrowRight size={14} /> {busy ? t("newModal.creating") : t("newModal.create")}
        </button>
      </div>
    </LeadModal>
  );
}
