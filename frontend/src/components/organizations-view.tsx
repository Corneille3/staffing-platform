"use client";

import { useRouter } from "../i18n/navigation";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { HideOnReadOnlyVisit } from "./read-only-visit";
import { Eyebrow, Mono } from "./ui";
import { ActivityRowCard } from "./apf-activity-row";
import { fetchAdminActivity, patchAdminOrganization } from "../lib/browser-api";
import type { AdminOrganizationSite, ApfActivityRow } from "../lib/types";

const TYPE_LABELS: Record<string, string> = {
  childcare: "Childcare",
  long_term_care: "Long-term care",
  community_care: "Community care",
  home_care: "Home care",
  assisted_living: "Assisted living",
  other: "Other",
};
const LANG_LABELS: Record<string, string> = { fr: "French", en: "English", bilingual: "Bilingual" };

const COUNT_WORDS = ["zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"];

function siteCode(name: string): string {
  const letters = name.replace(/[^A-Za-zÀ-ÿ ]/g, "").trim();
  const words = letters.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0] + (words[1][1] ?? "")).toUpperCase();
  return name.slice(0, 3).toUpperCase();
}

function fillColor(rate: number): string {
  if (rate >= 85) return "var(--moss)";
  if (rate >= 50) return "var(--sand)";
  return "var(--rose)";
}

export function OrganizationsView({ sites: initial }: { sites: AdminOrganizationSite[] }) {
  const router = useRouter();
  // Default selection = highest-volume site (backend already sorts that way).
  const [sites, setSites] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const [editing, setEditing] = useState(false);

  const selected = sites.find((s) => s.id === selectedId) ?? null;

  if (sites.length === 0) {
    return (
      <div
        style={{
          background: "var(--card)",
          border: "0.5px solid var(--line)",
          borderRadius: "var(--r-md)",
          padding: "40px 28px",
          textAlign: "center",
        }}
      >
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: 0 }}>
          No sites <em style={{ fontStyle: "italic" }}>yet</em>
        </h2>
        <p style={{ color: "var(--ink-3)", fontSize: 14, marginTop: 8 }}>
          You haven&apos;t been added to a site yet. Ask your network admin.
        </p>
      </div>
    );
  }

  const single = sites.length === 1;

  function handleSaved(updated: AdminOrganizationSite) {
    setSites((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setEditing(false);
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: single ? "1fr" : "1.2fr 1.5fr",
        gap: 18,
        alignItems: "start",
      }}
    >
      {!single && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: 0, fontWeight: 400 }}>
              {COUNT_WORDS[sites.length] ?? sites.length}{" "}
              <em style={{ fontStyle: "italic" }}>locations</em>
            </h2>
          </div>
          {sites.map((site) => {
            const isSel = site.id === selectedId;
            return (
              <button
                key={site.id}
                onClick={() => setSelectedId(site.id)}
                style={{
                  textAlign: "left",
                  cursor: "pointer",
                  fontFamily: "var(--ui)",
                  display: "grid",
                  gap: 10,
                  padding: 14,
                  borderRadius: 14,
                  background: isSel ? "var(--ink)" : "var(--card)",
                  color: isSel ? "var(--paper)" : "var(--ink)",
                  border: "0.5px solid var(--line)",
                  borderLeft: isSel ? "3px solid var(--terra)" : "0.5px solid var(--line)",
                  opacity: site.is_active ? 1 : 0.6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 10,
                      background: isSel ? "var(--terra)" : "var(--paper-2)",
                      color: isSel ? "#fff" : "var(--ink-2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "var(--mono)",
                      fontSize: 13,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {siteCode(site.name)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                      {site.name}
                      {!site.is_active && (
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-3)", border: "0.5px solid var(--line)", borderRadius: 999, padding: "1px 6px" }}>
                          Inactive
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, opacity: isSel ? 0.7 : 0.6 }}>
                      {site.city} · {TYPE_LABELS[site.type] ?? site.type}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 14 }}>
                  <MiniStat label="Enrolled" value={`${site.enrolled_count ?? "—"}/${site.capacity ?? "—"}`} dim={isSel} />
                  <MiniStat
                    label="Fill 30d"
                    value={`${site.metrics.fill_rate_30d}%`}
                    color={fillColor(site.metrics.fill_rate_30d)}
                    dim={isSel}
                  />
                  <MiniStat label="Requests" value={`${site.metrics.requests_30d}`} dim={isSel} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <SiteDetail
          site={selected}
          onEdit={() => setEditing(true)}
          onNewRequest={() => router.push(`/admin/requests/new?orgId=${selected.id}`)}
          onActivityLog={() => router.push(`/admin/activity?site_id=${selected.id}`)}
        />
      )}

      {editing && selected && (
        <EditModal site={selected} onClose={() => setEditing(false)} onSaved={handleSaved} />
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  color,
  dim,
}: {
  label: string;
  value: string;
  color?: string;
  dim?: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", opacity: dim ? 0.55 : 0.5 }}>
        {label}
      </div>
      <Mono style={{ fontSize: 14, fontWeight: 600, color: color ?? "inherit" }}>{value}</Mono>
    </div>
  );
}

function SiteDetail({
  site,
  onEdit,
  onNewRequest,
  onActivityLog,
}: {
  site: AdminOrganizationSite;
  onEdit: () => void;
  onNewRequest: () => void;
  onActivityLog: () => void;
}) {
  const m = site.metrics;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Header card */}
      <div
        style={{
          background: "var(--card)",
          border: "0.5px solid var(--line)",
          borderRadius: "var(--r-md)",
          padding: 20,
          display: "grid",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <Eyebrow>{LANG_LABELS[site.preferred_language] ?? site.preferred_language}</Eyebrow>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: 26, margin: "4px 0 2px", fontWeight: 400 }}>
              {site.name}
            </h2>
            <div style={{ color: "var(--ink-3)", fontSize: 13 }}>
              {[site.address_line1, site.neighbourhood, site.city].filter(Boolean).join(" · ")}
            </div>
          </div>
          <HideOnReadOnlyVisit>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <ActionButton onClick={onEdit} variant="ghost">Edit</ActionButton>
            {site.is_active && (
              <ActionButton onClick={onNewRequest} variant="terra">+ New request</ActionButton>
            )}
          </div>
          </HideOnReadOnlyVisit>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <KpiTile label="Fill rate" value={`${m.fill_rate_30d}%`} color={fillColor(m.fill_rate_30d)} />
          <KpiTile label="Requests 30d" value={`${m.requests_30d}`} />
          <KpiTile label="Filled 30d" value={`${m.filled_30d}`} />
          <KpiTile label="Enrollment" value={`${site.enrolled_count ?? "—"}/${site.capacity ?? "—"}`} />
        </div>
      </div>

      {/* Two-column: details | coordinators */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div
          style={{
            background: "var(--card)",
            border: "0.5px solid var(--line)",
            borderRadius: "var(--r-md)",
            padding: 18,
          }}
        >
          <Eyebrow>Site details</Eyebrow>
          <div style={{ display: "grid", gap: 8, marginTop: 12, fontSize: 13 }}>
            <DetailRow label="Type" value={TYPE_LABELS[site.type] ?? site.type} />
            <DetailRow label="Hours" value={site.hours_label ?? "—"} />
            <DetailRow label="Phone" value={site.contact_phone ?? "—"} />
            <DetailRow label="Language" value={LANG_LABELS[site.preferred_language] ?? site.preferred_language} />
            <DetailRow label="Capacity" value={site.capacity != null ? `${site.capacity}` : "—"} />
            <DetailRow label="Enrolled" value={site.enrolled_count != null ? `${site.enrolled_count}` : "—"} />
          </div>
        </div>

        <div
          style={{
            background: "var(--card)",
            border: "0.5px solid var(--line)",
            borderRadius: "var(--r-md)",
            padding: 18,
          }}
        >
          <Eyebrow>Coordinators</Eyebrow>
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {site.coordinators.length === 0 && (
              <span style={{ fontSize: 13, color: "var(--ink-3)" }}>None assigned</span>
            )}
            {site.coordinators.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 99,
                    background: "var(--paper-2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--ink-2)",
                  }}
                >
                  {c.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                </div>
                <span style={{ fontSize: 13 }}>{c.name}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "0.5px solid var(--line)", fontSize: 12, color: "var(--ink-3)" }}>
            Roster today: <strong style={{ color: "var(--ink-2)" }}>{site.roster_today.on_site}</strong> on site ·{" "}
            <strong style={{ color: "var(--ink-2)" }}>{site.roster_today.substitutes_arriving}</strong> arriving
          </div>
        </div>
      </div>

      {/* Recent activity preview */}
      <div
        style={{
          background: "var(--card)",
          border: "0.5px solid var(--line)",
          borderRadius: "var(--r-md)",
          padding: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
          <Eyebrow>Recent activity</Eyebrow>
          <button
            onClick={onActivityLog}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--terra)", fontFamily: "var(--ui)", fontSize: 13, fontWeight: 600 }}
          >
            Open activity log →
          </button>
        </div>
        <SiteActivityPreview siteId={site.id} />
      </div>
    </div>
  );
}

function SiteActivityPreview({ siteId }: { siteId: string }) {
  const [rows, setRows] = useState<ApfActivityRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    fetchAdminActivity({ siteId, limit: 3 })
      .then((res) => alive && setRows(res.items.slice(0, 3)))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [siteId]);

  if (rows === null) return <p style={{ fontSize: 13, color: "var(--ink-3)" }}>Loading…</p>;
  if (rows.length === 0) return <p style={{ fontSize: 13, color: "var(--ink-3)" }}>No recent activity at this site.</p>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {rows.map((row) => <ActivityRowCard key={row.id} row={row} />)}
    </div>
  );
}

function KpiTile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: "var(--paper-2)", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ink-3)" }}>
        {label}
      </div>
      <Mono style={{ fontSize: 20, fontWeight: 600, color: color ?? "var(--ink)" }}>{value}</Mono>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: "var(--ink-3)" }}>{label}</span>
      <span style={{ color: "var(--ink)", fontWeight: 500, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  variant,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant: "ghost" | "terra";
}) {
  return (
    <button
      onClick={onClick}
      style={{
        cursor: "pointer",
        fontFamily: "var(--ui)",
        fontSize: 13,
        fontWeight: 600,
        borderRadius: 10,
        padding: "9px 14px",
        minHeight: 40,
        border: variant === "terra" ? "none" : "0.5px solid var(--line)",
        background: variant === "terra" ? "var(--terra)" : "transparent",
        color: variant === "terra" ? "#fff" : "var(--ink-2)",
      }}
    >
      {children}
    </button>
  );
}

function EditModal({
  site,
  onClose,
  onSaved,
}: {
  site: AdminOrganizationSite;
  onClose: () => void;
  onSaved: (updated: AdminOrganizationSite) => void;
}) {
  const [form, setForm] = useState({
    name: site.name,
    address_line1: site.address_line1 ?? "",
    hours_label: site.hours_label ?? "",
    contact_phone: site.contact_phone ?? "",
    preferred_language: site.preferred_language,
    capacity: site.capacity?.toString() ?? "",
    enrolled_count: site.enrolled_count?.toString() ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const updated = await patchAdminOrganization(site.id, {
        name: form.name,
        address_line1: form.address_line1 || null,
        hours_label: form.hours_label || null,
        contact_phone: form.contact_phone || null,
        preferred_language: form.preferred_language,
        capacity: form.capacity === "" ? null : Number(form.capacity),
        enrolled_count: form.enrolled_count === "" ? null : Number(form.enrolled_count),
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(21,20,15,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card)",
          borderRadius: "var(--r-md)",
          padding: 22,
          width: "min(440px, 100%)",
          maxHeight: "90vh",
          overflowY: "auto",
          display: "grid",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontFamily: "var(--serif)", fontSize: 20, margin: 0, fontWeight: 400 }}>
            Edit <em style={{ fontStyle: "italic" }}>site</em>
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)" }}>
            <X size={18} />
          </button>
        </div>
        <Field label="Name"><Input value={form.name} onChange={(v) => set("name", v)} /></Field>
        <Field label="Address"><Input value={form.address_line1} onChange={(v) => set("address_line1", v)} /></Field>
        <Field label="Hours"><Input value={form.hours_label} onChange={(v) => set("hours_label", v)} /></Field>
        <Field label="Phone"><Input value={form.contact_phone} onChange={(v) => set("contact_phone", v)} /></Field>
        <Field label="Language">
          <select
            value={form.preferred_language}
            onChange={(e) => set("preferred_language", e.target.value)}
            style={inputStyle}
          >
            <option value="fr">French</option>
            <option value="en">English</option>
            <option value="bilingual">Bilingual</option>
          </select>
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Capacity"><Input value={form.capacity} onChange={(v) => set("capacity", v)} type="number" /></Field>
          <Field label="Enrolled"><Input value={form.enrolled_count} onChange={(v) => set("enrolled_count", v)} type="number" /></Field>
        </div>
        {error && <p style={{ color: "var(--rose)", fontSize: 13, fontWeight: 600, margin: 0 }}>{error}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <ActionButton onClick={onClose} variant="ghost">Cancel</ActionButton>
          <button
            onClick={save}
            disabled={busy}
            style={{
              cursor: busy ? "wait" : "pointer",
              fontFamily: "var(--ui)",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 10,
              padding: "9px 16px",
              minHeight: 40,
              border: "none",
              background: "var(--terra)",
              color: "#fff",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 10,
  border: "0.5px solid var(--line)",
  background: "var(--paper-2)",
  fontFamily: "var(--ui)",
  fontSize: 14,
  color: "var(--ink)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ink-3)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />;
}
