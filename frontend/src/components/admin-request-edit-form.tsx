"use client";

import { useRouter } from "../i18n/navigation";
import { useTranslations } from "next-intl";
import { useCredentialLabel } from "../hooks/use-credential-label";
import { useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { patchAdminRequest } from "../lib/browser-api";
import {
  CERTIFICATIONS,
  COVERAGE_TYPES,
  LANGUAGES,
  QUALIFICATIONS,
  ROLES,
} from "../lib/request-form-options";
import type { StaffingRequest } from "../lib/types";
import { Eyebrow } from "./ui";
import { ShiftDurationNote } from "./shift-duration-note";
import { shiftDuration } from "../lib/shift-duration";

interface EditState {
  title: string;
  description: string;
  city: string;
  location_name: string;
  work_date: string;
  start_time: string;
  end_time: string;
  role: string;
  language_requirement: string;
  required_qualifications: string[];
  required_certifications: string[];
  urgency_level: number;
  coverage_type: string;
  contact_name: string;
  contact_phone: string;
  arrival_instructions: string;
}

function hhmm(value: string | null | undefined): string {
  return (value ?? "").slice(0, 5);
}

function initialState(request: StaffingRequest): EditState {
  return {
    title: request.title ?? "",
    description: request.description ?? "",
    city: request.city ?? "",
    location_name: request.location_name ?? "",
    work_date: (request.work_date ?? "").slice(0, 10),
    start_time: hhmm(request.start_time),
    end_time: hhmm(request.end_time),
    role: request.role ?? "educator",
    language_requirement: request.language_requirement ?? "",
    required_qualifications: request.required_qualifications ?? [],
    required_certifications: request.required_certifications ?? [],
    urgency_level: request.urgency_level ?? 2,
    coverage_type: request.coverage_type ?? "same_day_urgent",
    contact_name: request.contact_name ?? "",
    contact_phone: request.contact_phone ?? "",
    arrival_instructions: request.arrival_instructions ?? "",
  };
}

export function AdminRequestEditForm({
  request,
  orgName,
  hasAccepted = false,
}: {
  request: StaffingRequest;
  orgName: string;
  /** Someone already accepted — Re-notify is hidden on the request page, so
   * the warning must not promise it. */
  hasAccepted?: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("admin.form");
  const tAdmin = useTranslations("admin");
  const tCommon = useTranslations("common");
  const credentialLabel = useCredentialLabel();
  const [form, setForm] = useState<EditState>(() => initialState(request));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Workers have already been pinged once the request is past `open` — so a
  // shift-detail change here won't reach them unless the coordinator re-notifies.
  const alreadyNotified = request.status === "notified" || request.status === "responses_received";

  function update<K extends keyof EditState>(key: K, value: EditState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleListItem(key: "required_qualifications" | "required_certifications", code: string) {
    setForm((prev) => {
      const list = prev[key];
      const has = list.includes(code);
      return { ...prev, [key]: has ? list.filter((c) => c !== code) : [...list, code] };
    });
  }

  const tooLong = shiftDuration(form.start_time, form.end_time)?.tooLong ?? false;

  async function handleSave() {
    if (!form.title.trim() || !form.city.trim() || !form.work_date || !form.start_time || !form.end_time) {
      setError(t("editRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await patchAdminRequest(request.id, {
        title: form.title.trim(),
        description: form.description.trim() || null,
        city: form.city.trim(),
        location_name: form.location_name.trim() || null,
        work_date: form.work_date,
        start_time: form.start_time,
        end_time: form.end_time,
        urgency_level: form.urgency_level,
        language_requirement: form.language_requirement || null,
        role: form.role || null,
        coverage_type: form.coverage_type,
        contact_name: form.contact_name.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        arrival_instructions: form.arrival_instructions.trim() || null,
        required_qualifications: form.required_qualifications,
        required_certifications: form.required_certifications,
      });
      router.push(`/admin/requests/${request.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveFailed"));
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 18, maxWidth: 760 }}>
      {alreadyNotified && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "12px 14px",
            borderRadius: "var(--r-md)",
            background: "var(--sand-soft)",
            border: "0.5px solid var(--sand)",
            color: "#7C5C12",
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          <TriangleAlert size={18} strokeWidth={1.6} style={{ flexShrink: 0, marginTop: 1 }} />
          {hasAccepted ? (
            <div>{t.rich("warnAccepted", { b: (chunks) => <strong style={{ fontWeight: 600 }}>{chunks}</strong> })}</div>
          ) : (
            <div>{t.rich("warnNotified", { b: (chunks) => <strong style={{ fontWeight: 600 }}>{chunks}</strong> })}</div>
          )}
        </div>
      )}

      <div
        style={{
          background: "var(--card)",
          border: "0.5px solid var(--line)",
          borderRadius: "var(--r-lg)",
          padding: 24,
          display: "grid",
          gap: 18,
        }}
      >
        <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
          {t.rich("orgLine", { name: orgName, b: (chunks) => <strong style={{ color: "var(--ink-2)", fontWeight: 600 }}>{chunks}</strong> })}
          <span style={{ marginLeft: 6 }}>{t("orgLocked")}</span>
        </div>

        <Field label={t("title")}>
          <input value={form.title} onChange={(e) => update("title", e.target.value)} style={inputStyle} />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label={t("city")}>
            <input value={form.city} onChange={(e) => update("city", e.target.value)} style={inputStyle} />
          </Field>
          <Field label={t("location")}>
            <input
              value={form.location_name}
              onChange={(e) => update("location_name", e.target.value)}
              placeholder={t("locationPlaceholder")}
              style={inputStyle}
            />
          </Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <Field label={t("date")}>
            <input type="date" value={form.work_date} onChange={(e) => update("work_date", e.target.value)} style={inputStyle} />
          </Field>
          <Field label={t("start")}>
            <input type="time" value={form.start_time} onChange={(e) => update("start_time", e.target.value)} style={inputStyle} />
          </Field>
          <Field label={t("end")}>
            <input type="time" value={form.end_time} onChange={(e) => update("end_time", e.target.value)} style={inputStyle} />
          </Field>
        </div>
        <ShiftDurationNote start={form.start_time} end={form.end_time} />

        <Field label={t("role")}>
          <ChipRow>
            {ROLES.map((r) => (
              <Chip key={r.value} active={form.role === r.value} onClick={() => update("role", r.value)}>
                {r.value === "other" ? t("roleOther") : tAdmin(`roles.${r.value}`)}
              </Chip>
            ))}
          </ChipRow>
        </Field>

        <Field label={t("qualifications")}>
          <ChipRow>
            {QUALIFICATIONS.map((q) => (
              <Chip
                key={q.code}
                active={form.required_qualifications.includes(q.code)}
                onClick={() => toggleListItem("required_qualifications", q.code)}
              >
                {form.required_qualifications.includes(q.code) && <Check size={10} strokeWidth={2.2} />}
                {credentialLabel(q.code)}
              </Chip>
            ))}
          </ChipRow>
        </Field>

        <Field label={t("certifications")}>
          <ChipRow>
            {CERTIFICATIONS.map((c) => (
              <Chip
                key={c.code}
                active={form.required_certifications.includes(c.code)}
                onClick={() => toggleListItem("required_certifications", c.code)}
              >
                {form.required_certifications.includes(c.code) && <Check size={10} strokeWidth={2.2} />}
                {credentialLabel(c.code)}
              </Chip>
            ))}
          </ChipRow>
        </Field>

        <Field label={t("language")}>
          <ChipRow>
            {LANGUAGES.map((l) => (
              <Chip
                key={l.value || "none"}
                active={form.language_requirement === l.value}
                onClick={() => update("language_requirement", l.value)}
              >
                {l.value ? tAdmin(`languageNames.${l.value}`) : t("noPreference")}
              </Chip>
            ))}
          </ChipRow>
        </Field>

        <Field label={t("urgency")}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {COVERAGE_TYPES.map((opt) => {
              const active = form.coverage_type === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update("coverage_type", opt.value)}
                  style={{
                    padding: "14px 16px",
                    borderRadius: 14,
                    background: active ? "var(--card)" : "var(--paper-2)",
                    border: `0.5px solid ${active ? "var(--terra)" : "var(--line)"}`,
                    boxShadow: active ? "0 0 0 3px rgba(220, 90, 42, 0.08)" : "none",
                    textAlign: "left",
                    cursor: "pointer",
                    fontFamily: "var(--ui)",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{t(`coverage.${opt.value}.label`)}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{t(`coverage.${opt.value}.sub`)}</div>
                </button>
              );
            })}
          </div>
        </Field>

        <Field label={t("urgencyLevel")}>
          <ChipRow>
            {[
              { v: 1, l: t("low") },
              { v: 2, l: t("standard") },
              { v: 3, l: t("urgent") },
            ].map((opt) => (
              <Chip key={opt.v} active={form.urgency_level === opt.v} onClick={() => update("urgency_level", opt.v)}>
                {opt.l}
              </Chip>
            ))}
          </ChipRow>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label={t("contactName")}>
            <input value={form.contact_name} onChange={(e) => update("contact_name", e.target.value)} style={inputStyle} />
          </Field>
          <Field label={t("contactPhone")}>
            <input type="tel" value={form.contact_phone} onChange={(e) => update("contact_phone", e.target.value)} style={inputStyle} />
          </Field>
        </div>

        <Field label={t("arrival")}>
          <textarea
            value={form.arrival_instructions}
            onChange={(e) => update("arrival_instructions", e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
          />
        </Field>

        <Field label={t("notes")}>
          <textarea
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
          />
        </Field>

        {error && <p style={{ margin: 0, color: "var(--rose)", fontSize: 13 }}>{error}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
          <button type="button" onClick={() => router.push(`/admin/requests/${request.id}`)} style={ghostBtn}>
            {tCommon("cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || tooLong}
            style={{ ...primaryBtn, opacity: saving || tooLong ? 0.6 : 1, cursor: saving || tooLong ? "not-allowed" : "pointer" }}
          >
            {saving ? tCommon("saving") : t("saveChanges")} <Check size={14} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "10px 16px",
  borderRadius: 999,
  background: "transparent",
  border: "0.5px solid var(--line)",
  color: "var(--ink)",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "var(--ui)",
};

const primaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "10px 16px",
  borderRadius: 999,
  background: "var(--ink)",
  border: 0,
  color: "var(--paper)",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "var(--ui)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <Eyebrow>{label}</Eyebrow>
      {children}
    </label>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{children}</div>;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 14px",
        borderRadius: 999,
        background: active ? "var(--ink)" : "var(--card)",
        color: active ? "var(--paper)" : "var(--ink)",
        border: `0.5px solid ${active ? "var(--ink)" : "var(--line)"}`,
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        fontFamily: "var(--ui)",
      }}
    >
      {children}
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "0.5px solid var(--line)",
  padding: "11px 12px",
  background: "var(--card)",
  color: "var(--ink)",
  fontSize: 14,
  fontFamily: "var(--ui)",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};
