"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import {
  createAdminRequest,
  patchAdminRequest,
  publishAdminRequest,
  rankAdminSubstitutes,
} from "../lib/browser-api";
import type { Organization } from "../lib/types";
import { Eyebrow, Mono } from "./ui";

const STEPS = ["Where & when", "Who you need", "Notify"] as const;

const ROLES: { value: string; label: string }[] = [
  { value: "educator", label: "Educator" },
  { value: "assistant_educator", label: "Assistant educator" },
  { value: "psw", label: "PSW" },
  { value: "nurse", label: "Nurse" },
  { value: "food_handler", label: "Food handler" },
  { value: "other", label: "Other" },
];

const QUALIFICATIONS = [
  { code: "ECE_LEVEL_1", label: "ECE Level 1" },
  { code: "AEC_PETITE_ENFANCE", label: "AEC Petite enfance" },
  { code: "DEC_TEE", label: "DEC TEE" },
  { code: "PSW", label: "PSW" },
  { code: "NURSE", label: "Nurse" },
];

const CERTIFICATIONS = [
  { code: "FIRST_AID", label: "First Aid" },
  { code: "FOOD_HANDLER", label: "Food Handler" },
  { code: "CPR", label: "CPR" },
];

const LANGUAGES = [
  { value: "fr", label: "French" },
  { value: "en", label: "English" },
  { value: "bilingual", label: "Bilingual" },
  { value: "", label: "No preference" },
];

const COVERAGE_TYPES: { value: string; label: string; sub: string }[] = [
  { value: "same_day_urgent", label: "Same-day urgent", sub: "Notify in 15 min · phone too" },
  { value: "planned_absence", label: "Planned absence", sub: "Notify over 24 h" },
  { value: "recurring", label: "Recurring", sub: "Repeats weekly" },
  { value: "emergency", label: "Emergency", sub: "Page everyone available" },
];

interface DraftState {
  organization_id: string;
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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyDraft(firstOrg: Organization | undefined): DraftState {
  return {
    organization_id: firstOrg?.id ?? "",
    title: "",
    description: "",
    city: firstOrg?.city ?? "",
    location_name: "",
    work_date: todayIso(),
    start_time: "08:00",
    end_time: "12:00",
    role: "educator",
    language_requirement: "fr",
    required_qualifications: [],
    required_certifications: [],
    urgency_level: 2,
    coverage_type: "same_day_urgent",
    contact_name: "",
    contact_phone: "",
    arrival_instructions: "",
  };
}

function step1Complete(d: DraftState): boolean {
  return Boolean(
    d.organization_id && d.title.trim() && d.city.trim() &&
    d.work_date && d.start_time && d.end_time,
  );
}

export function AdminRequestNewForm({ organizations }: { organizations: Organization[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<DraftState>(() => emptyDraft(organizations[0]));
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [eligibleCount, setEligibleCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const saveTimerRef = useRef<number | null>(null);
  const reachTimerRef = useRef<number | null>(null);

  function update<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      // When org changes, default city + contact to the org's defaults.
      if (key === "organization_id") {
        const org = organizations.find((o) => o.id === value);
        if (org) next.city = next.city || org.city;
      }
      return next;
    });
  }

  function toggleListItem(key: "required_qualifications" | "required_certifications", code: string) {
    setDraft((prev) => {
      const list = prev[key];
      const has = list.includes(code);
      return { ...prev, [key]: has ? list.filter((c) => c !== code) : [...list, code] };
    });
  }

  // Create the draft as soon as step 1 is complete and we don't have an id yet.
  useEffect(() => {
    let cancelled = false;
    if (!draftId && step >= 1 && step1Complete(draft)) {
      setSaveState("saving");
      createAdminRequest({
        organization_id: draft.organization_id,
        request_type: "urgent_replacement",
        title: draft.title.trim(),
        city: draft.city.trim(),
        location_name: draft.location_name.trim() || null,
        work_date: draft.work_date,
        start_time: draft.start_time,
        end_time: draft.end_time,
        urgency_level: draft.urgency_level,
        language_requirement: draft.language_requirement || null,
        role: draft.role || null,
        coverage_type: draft.coverage_type,
        required_qualifications: draft.required_qualifications,
        required_certifications: draft.required_certifications,
      })
        .then((created) => {
          if (cancelled) return;
          setDraftId(created.id);
          setSaveState("saved");
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "Failed to create draft");
          setSaveState("error");
        });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, draftId]);

  // Debounced PATCH whenever the draft state changes (after the draft exists).
  useEffect(() => {
    if (!draftId) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    setSaveState("saving");
    saveTimerRef.current = window.setTimeout(() => {
      patchAdminRequest(draftId, {
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        city: draft.city.trim(),
        location_name: draft.location_name.trim() || null,
        work_date: draft.work_date,
        start_time: draft.start_time,
        end_time: draft.end_time,
        urgency_level: draft.urgency_level,
        language_requirement: draft.language_requirement || null,
        role: draft.role || null,
        coverage_type: draft.coverage_type,
        contact_name: draft.contact_name.trim() || null,
        contact_phone: draft.contact_phone.trim() || null,
        arrival_instructions: draft.arrival_instructions.trim() || null,
        required_qualifications: draft.required_qualifications,
        required_certifications: draft.required_certifications,
      })
        .then(() => setSaveState("saved"))
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Autosave failed");
          setSaveState("error");
        });
    }, 400);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draftId,
    draft.title,
    draft.description,
    draft.city,
    draft.location_name,
    draft.work_date,
    draft.start_time,
    draft.end_time,
    draft.urgency_level,
    draft.language_requirement,
    draft.role,
    draft.coverage_type,
    draft.contact_name,
    draft.contact_phone,
    draft.arrival_instructions,
    draft.required_qualifications.join(","),
    draft.required_certifications.join(","),
  ]);

  // Reach estimate — debounced after the autosave so we don't race.
  useEffect(() => {
    if (!draftId) return;
    if (reachTimerRef.current) window.clearTimeout(reachTimerRef.current);
    reachTimerRef.current = window.setTimeout(() => {
      rankAdminSubstitutes(draftId)
        .then((resp) => {
          const count = resp.items.filter((row) => row.eligible).length;
          setEligibleCount(count);
        })
        .catch(() => {
          setEligibleCount(null);
        });
    }, 700);
    return () => {
      if (reachTimerRef.current) window.clearTimeout(reachTimerRef.current);
    };
  }, [
    draftId,
    draft.city,
    draft.work_date,
    draft.start_time,
    draft.language_requirement,
    draft.required_qualifications.join(","),
    draft.required_certifications.join(","),
  ]);

  async function handlePublish() {
    if (!draftId) {
      setError("Draft is not saved yet — wait a moment.");
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      await publishAdminRequest(draftId);
      router.push(`/admin/requests/${draftId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
      setPublishing(false);
    }
  }

  function next() {
    if (step === 0 && !step1Complete(draft)) {
      setError("Fill in organization, title, city, date, and times before continuing.");
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  const currentOrg = useMemo(
    () => organizations.find((o) => o.id === draft.organization_id),
    [organizations, draft.organization_id],
  );

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <Stepper step={step} saveState={saveState} draftId={draftId} />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 24 }}>
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
          <Eyebrow>Step {step + 1} · {STEPS[step]}</Eyebrow>

          {step === 0 && (
            <StepWhere draft={draft} organizations={organizations} update={update} />
          )}
          {step === 1 && (
            <StepWho
              draft={draft}
              update={update}
              toggleListItem={toggleListItem}
            />
          )}
          {step === 2 && (
            <StepNotify draft={draft} update={update} />
          )}

          {error && (
            <p style={{ margin: 0, color: "var(--rose)", fontSize: 13 }}>{error}</p>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <button
              type="button"
              onClick={back}
              disabled={step === 0}
              style={{
                ...ghostBtn,
                opacity: step === 0 ? 0.4 : 1,
                cursor: step === 0 ? "not-allowed" : "pointer",
              }}
            >
              <ArrowLeft size={14} strokeWidth={1.8} /> Back
            </button>
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={next} style={primaryBtn}>
                Continue <ArrowRight size={14} strokeWidth={1.8} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing || !draftId}
                style={{
                  ...primaryBtn,
                  opacity: publishing || !draftId ? 0.6 : 1,
                  cursor: publishing || !draftId ? "not-allowed" : "pointer",
                }}
              >
                {publishing ? "Publishing…" : "Publish request"} <Check size={14} strokeWidth={2.2} />
              </button>
            )}
          </div>
        </div>

        <PreviewSidebar
          draft={draft}
          eligibleCount={eligibleCount}
          orgName={currentOrg?.name ?? "Organization"}
          ready={draftId !== null}
        />
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

function Stepper({ step, saveState, draftId }: { step: number; saveState: string; draftId: string | null }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flex: 1, flexWrap: "wrap" }}>
        {STEPS.map((label, i) => {
          const isDone = i < step;
          const isCurrent = i === step;
          return (
            <div
              key={label}
              style={{
                flex: 1,
                minWidth: 180,
                padding: "10px 14px",
                borderRadius: 12,
                background: isCurrent ? "var(--card)" : "var(--paper-2)",
                border: `0.5px solid ${isCurrent ? "var(--ink)" : "var(--line)"}`,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 99,
                  fontSize: 11,
                  fontWeight: 500,
                  background: isDone ? "var(--moss)" : isCurrent ? "var(--ink)" : "transparent",
                  color: isDone || isCurrent ? "#fff" : "var(--ink-3)",
                  border: !isDone && !isCurrent ? "0.5px solid var(--line)" : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isDone ? <Check size={12} strokeWidth={2.2} /> : i + 1}
              </div>
              <div style={{ lineHeight: 1.2, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--ink-3)",
                    letterSpacing: ".1em",
                    textTransform: "uppercase",
                  }}
                >
                  Step {i + 1}
                </div>
                <div style={{ fontSize: 12, fontWeight: 500 }}>{label}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--ink-3)",
          fontFamily: "var(--mono)",
          letterSpacing: ".04em",
          whiteSpace: "nowrap",
        }}
      >
        {draftId ? (saveState === "saving" ? "Saving…" : saveState === "saved" ? "Draft · saved" : saveState === "error" ? "Save failed" : "Draft") : "Draft · pending"}
      </div>
    </div>
  );
}

function StepWhere({
  draft,
  organizations,
  update,
}: {
  draft: DraftState;
  organizations: Organization[];
  update: <K extends keyof DraftState>(key: K, value: DraftState[K]) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Field label="Organization">
        <select
          value={draft.organization_id}
          onChange={(e) => update("organization_id", e.target.value)}
          style={inputStyle}
        >
          {organizations.length === 0 ? (
            <option value="">No organizations yet</option>
          ) : (
            organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name} · {org.city}
              </option>
            ))
          )}
        </select>
      </Field>

      <Field label="Title">
        <input
          value={draft.title}
          onChange={(e) => update("title", e.target.value)}
          placeholder="Educator · today, 07:30 — 14:30"
          style={inputStyle}
        />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="City">
          <input value={draft.city} onChange={(e) => update("city", e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Location (optional)">
          <input
            value={draft.location_name}
            onChange={(e) => update("location_name", e.target.value)}
            placeholder="Toddler room, 2nd floor"
            style={inputStyle}
          />
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <Field label="Date">
          <input type="date" value={draft.work_date} onChange={(e) => update("work_date", e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Start">
          <input type="time" value={draft.start_time} onChange={(e) => update("start_time", e.target.value)} style={inputStyle} />
        </Field>
        <Field label="End">
          <input type="time" value={draft.end_time} onChange={(e) => update("end_time", e.target.value)} style={inputStyle} />
        </Field>
      </div>
    </div>
  );
}

function StepWho({
  draft,
  update,
  toggleListItem,
}: {
  draft: DraftState;
  update: <K extends keyof DraftState>(key: K, value: DraftState[K]) => void;
  toggleListItem: (key: "required_qualifications" | "required_certifications", code: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Field label="Role">
        <ChipRow>
          {ROLES.map((r) => (
            <Chip
              key={r.value}
              active={draft.role === r.value}
              onClick={() => update("role", r.value)}
            >
              {r.label}
            </Chip>
          ))}
        </ChipRow>
      </Field>

      <Field label="Required qualifications">
        <ChipRow>
          {QUALIFICATIONS.map((q) => (
            <Chip
              key={q.code}
              active={draft.required_qualifications.includes(q.code)}
              onClick={() => toggleListItem("required_qualifications", q.code)}
            >
              {draft.required_qualifications.includes(q.code) && (
                <Check size={10} strokeWidth={2.2} />
              )}
              {q.label}
            </Chip>
          ))}
        </ChipRow>
      </Field>

      <Field label="Required certifications">
        <ChipRow>
          {CERTIFICATIONS.map((c) => (
            <Chip
              key={c.code}
              active={draft.required_certifications.includes(c.code)}
              onClick={() => toggleListItem("required_certifications", c.code)}
            >
              {draft.required_certifications.includes(c.code) && (
                <Check size={10} strokeWidth={2.2} />
              )}
              {c.label}
            </Chip>
          ))}
        </ChipRow>
      </Field>

      <Field label="Language">
        <ChipRow>
          {LANGUAGES.map((l) => (
            <Chip
              key={l.value || "none"}
              active={draft.language_requirement === l.value}
              onClick={() => update("language_requirement", l.value)}
            >
              {l.label}
            </Chip>
          ))}
        </ChipRow>
      </Field>

      <Field label="Arrival instructions (visible to substitute)">
        <textarea
          value={draft.arrival_instructions}
          onChange={(e) => update("arrival_instructions", e.target.value)}
          placeholder="Ask for Sylvie at the front desk."
          rows={3}
          style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
        />
      </Field>
    </div>
  );
}

function StepNotify({
  draft,
  update,
}: {
  draft: DraftState;
  update: <K extends keyof DraftState>(key: K, value: DraftState[K]) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Field label="Urgency">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {COVERAGE_TYPES.map((opt) => {
            const active = draft.coverage_type === opt.value;
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
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 99,
                      border: "0.5px solid var(--line)",
                      background: active ? "var(--terra)" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {active && <div style={{ width: 6, height: 6, borderRadius: 99, background: "#fff" }} />}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{opt.label}</div>
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 22 }}>{opt.sub}</div>
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Urgency level (matching weight)">
        <ChipRow>
          {[
            { v: 1, l: "Low" },
            { v: 2, l: "Standard" },
            { v: 3, l: "Urgent" },
          ].map((opt) => (
            <Chip
              key={opt.v}
              active={draft.urgency_level === opt.v}
              onClick={() => update("urgency_level", opt.v)}
            >
              {opt.l}
            </Chip>
          ))}
        </ChipRow>
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Contact name (optional)">
          <input
            value={draft.contact_name}
            onChange={(e) => update("contact_name", e.target.value)}
            placeholder="Marie-Claude Bergeron"
            style={inputStyle}
          />
        </Field>
        <Field label="Contact phone (optional)">
          <input
            type="tel"
            value={draft.contact_phone}
            onChange={(e) => update("contact_phone", e.target.value)}
            placeholder="514-555-0100"
            style={inputStyle}
          />
        </Field>
      </div>

      <Field label="Notes (internal, optional)">
        <textarea
          value={draft.description}
          onChange={(e) => update("description", e.target.value)}
          rows={2}
          placeholder="Coverage details — only visible to the coordinator team."
          style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
        />
      </Field>
    </div>
  );
}

function PreviewSidebar({
  draft,
  eligibleCount,
  orgName,
  ready,
}: {
  draft: DraftState;
  eligibleCount: number | null;
  orgName: string;
  ready: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Eyebrow style={{ marginBottom: 0 }}>Preview · what workers will see</Eyebrow>
      <div
        style={{
          width: "100%",
          background: "var(--card)",
          borderRadius: 18,
          padding: "16px 18px",
          border: "0.5px solid var(--line)",
          borderLeft: "3px solid var(--terra)",
        }}
      >
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              borderRadius: 999,
              background: "var(--terra)",
              color: "var(--paper)",
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: ".04em",
            }}
          >
            Urgent
          </span>
          <span
            style={{
              padding: "3px 8px",
              borderRadius: 999,
              background: "var(--terra-soft)",
              color: "var(--terra-ink)",
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: ".04em",
            }}
          >
            New request
          </span>
        </div>

        <div style={{ fontFamily: "var(--serif)", fontSize: 22, lineHeight: 1.15, color: "var(--ink)" }}>
          {orgName}
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: 10 }}>
          {draft.role.replace(/_/g, " ")} · {draft.title || "New shift"}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div style={{ padding: "8px 10px", background: "var(--paper)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--ink)" }}>
              {draft.work_date || "Date"}
            </div>
            <div style={{ fontSize: 10, color: "var(--ink-3)", fontFamily: "var(--mono)" }}>
              <Mono>
                {draft.start_time} → {draft.end_time}
              </Mono>
            </div>
          </div>
          <div style={{ padding: "8px 10px", background: "var(--paper)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--ink)" }}>{draft.city || "City"}</div>
            <div style={{ fontSize: 10, color: "var(--ink-3)" }}>
              {draft.location_name || "—"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <div
            style={{
              flex: 1,
              padding: "9px 0",
              background: "var(--ink)",
              color: "var(--paper)",
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 500,
              textAlign: "center",
            }}
          >
            I can take it
          </div>
          <div
            style={{
              padding: "9px 14px",
              border: "0.5px solid var(--line)",
              borderRadius: 10,
              fontSize: 12,
              color: "var(--ink-2)",
            }}
          >
            Decline
          </div>
        </div>
      </div>

      <div
        style={{
          background: "var(--moss-soft)",
          border: "0.5px solid var(--moss)",
          borderRadius: "var(--r-md)",
          padding: "14px 16px",
        }}
      >
        <Eyebrow style={{ color: "var(--moss)", marginBottom: 6 }}>Reach estimate</Eyebrow>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: "var(--serif)", fontSize: 30, lineHeight: 1, color: "var(--moss)" }}>
            {ready ? (eligibleCount ?? "…") : "—"}
          </span>
          <span style={{ fontSize: 13, color: "var(--moss)", fontStyle: "italic" }}>
            eligible substitutes
          </span>
        </div>
        <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--moss)", lineHeight: 1.5, opacity: 0.85 }}>
          {ready
            ? "match language, qualifications, city, and weekly availability."
            : "complete step 1 and continue — the estimate appears once the draft is saved."}
        </p>
      </div>
    </div>
  );
}

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

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
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
