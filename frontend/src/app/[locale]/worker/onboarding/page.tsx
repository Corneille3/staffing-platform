"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Check, MapPin, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "../../../../i18n/navigation";
import { onboardWorker } from "../../../../lib/browser-api";
import { useWorkerSession } from "../../../../lib/worker-session";
import { Eyebrow } from "../../../../components/ui";

const COMMON_QUALS = ["ECE_LEVEL_1", "ECE_LEVEL_2", "ECE_LEVEL_3", "RSG", "TES"];
const COMMON_CERTS = ["FIRST_AID", "CPR", "FOOD_SAFETY"];
const LANGUAGES: { code: "fr" | "en" | "bilingual"; key: string }[] = [
  { code: "fr", key: "languageFr" },
  { code: "en", key: "languageEn" },
  { code: "bilingual", key: "languageBilingual" },
];

type Step = 1 | 2 | 3;

export default function OnboardingPage() {
  const router = useRouter();
  const { worker, refresh } = useWorkerSession();
  const t = useTranslations("worker.onboarding");
  const tCommon = useTranslations("common");

  const [step, setStep] = useState<Step>(1);
  const [cities, setCities] = useState<string[]>([]);
  const [cityInput, setCityInput] = useState("");
  const [quals, setQuals] = useState<string[]>([]);
  const [qualInput, setQualInput] = useState("");
  const [certs, setCerts] = useState<string[]>([]);
  const [certInput, setCertInput] = useState("");
  const [language, setLanguage] = useState<"fr" | "en" | "bilingual" | null>(
    worker ? (worker.preferred_language as "fr" | "en" | "bilingual") : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(
    () => ({ 1: cities.length, 2: quals.length + certs.length, 3: language ? 1 : 0 }),
    [cities.length, quals.length, certs.length, language],
  );

  function canAdvance(): boolean {
    if (step === 1) return cities.length > 0;
    if (step === 2) return true; // optional
    if (step === 3) return !!language;
    return false;
  }

  async function handleSubmit() {
    if (!worker || !language) return;
    setError(null);
    setSubmitting(true);
    try {
      await onboardWorker(worker.id, {
        availability_status: "available",
        urgent_alert_opt_in: true,
        supported_cities: cities,
        qualifications: quals,
        certifications: certs,
        preferred_language: language,
      });
      await refresh();
      router.push("/worker");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    if (!canAdvance()) return;
    if (step < 3) setStep((s) => (s + 1) as Step);
    else handleSubmit();
  }

  function back() {
    if (step > 1) setStep((s) => (s - 1) as Step);
  }

  if (!worker) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--paper)" }}>
        <p style={{ color: "var(--ink-3)", fontSize: 14 }}>{tCommon("loading")}</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", color: "var(--ink)", paddingBottom: 100 }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 20px 20px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          {step > 1 ? (
            <button
              type="button"
              onClick={back}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                border: "none", background: "none", color: "var(--ink-2)",
                fontSize: 14, padding: "8px 4px", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <ArrowLeft size={16} />
              <span>{t("back")}</span>
            </button>
          ) : <div />}
          <Eyebrow>{t("stepLabel", { current: step, total: 3 })}</Eyebrow>
        </div>

        {/* Progress bar — moss for done steps, terra for current, line for pending */}
        <div style={{ display: "flex", gap: 6, marginBottom: 26 }}>
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 99,
                background: n < step ? "var(--moss)" : n === step ? "var(--terra)" : "var(--line)",
              }}
            />
          ))}
        </div>

        {/* Welcome (step 1 only) */}
        {step === 1 && (
          <div style={{ marginBottom: 22 }}>
            <Eyebrow style={{ marginBottom: 4 }}>{t("welcomeEyebrow", { name: worker.first_name })}</Eyebrow>
            <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 30, lineHeight: 1.05 }}>
              {t("welcomeTitlePre")} <em style={{ fontStyle: "italic" }}>{t("welcomeTitleAccent")}</em>
            </h1>
            <p style={{ margin: "10px 0 0", fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5 }}>
              {t("welcomeBlurb")}
            </p>
          </div>
        )}

        {step === 1 && (
          <Section
            title={t("citiesTitle")}
            hint={t("citiesHint")}
            icon={<MapPin size={14} style={{ color: "var(--ink-3)" }} />}
          >
            <Tags values={cities} onRemove={(c) => setCities(cities.filter((x) => x !== c))} />
            <AddInput
              placeholder={t("cityPlaceholder")}
              value={cityInput}
              onChange={setCityInput}
              onAdd={() => {
                const v = cityInput.trim();
                if (v && !cities.includes(v)) setCities([...cities, v]);
                setCityInput("");
              }}
              addLabel={tCommon("add")}
            />
          </Section>
        )}

        {step === 2 && (
          <>
            <div style={{ marginBottom: 22 }}>
              <h2 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 26, lineHeight: 1.1 }}>
                {t("credentialsTitlePre")} <em style={{ fontStyle: "italic" }}>{t("credentialsTitleAccent")}</em>
              </h2>
              <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5 }}>
                {t("credentialsBlurb")}
              </p>
            </div>

            <Section title={t("qualificationsTitle")} hint={t("qualificationsHint")}>
              <SuggestRow
                suggestions={COMMON_QUALS.filter((s) => !quals.includes(s))}
                onPick={(s) => setQuals([...quals, s])}
              />
              <Tags values={quals} onRemove={(v) => setQuals(quals.filter((x) => x !== v))} />
              <AddInput
                placeholder={t("qualificationPlaceholder")}
                value={qualInput}
                onChange={setQualInput}
                onAdd={() => {
                  const v = qualInput.trim().toUpperCase();
                  if (v && !quals.includes(v)) setQuals([...quals, v]);
                  setQualInput("");
                }}
                addLabel={tCommon("add")}
              />
            </Section>

            <div style={{ height: 20 }} />

            <Section title={t("certificationsTitle")} hint={t("certificationsHint")}>
              <SuggestRow
                suggestions={COMMON_CERTS.filter((s) => !certs.includes(s))}
                onPick={(s) => setCerts([...certs, s])}
              />
              <Tags values={certs} onRemove={(v) => setCerts(certs.filter((x) => x !== v))} />
              <AddInput
                placeholder={t("certificationPlaceholder")}
                value={certInput}
                onChange={setCertInput}
                onAdd={() => {
                  const v = certInput.trim().toUpperCase();
                  if (v && !certs.includes(v)) setCerts([...certs, v]);
                  setCertInput("");
                }}
                addLabel={tCommon("add")}
              />
            </Section>
          </>
        )}

        {step === 3 && (
          <>
            <div style={{ marginBottom: 22 }}>
              <h2 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 26, lineHeight: 1.1 }}>
                {t("languagesTitlePre")} <em style={{ fontStyle: "italic" }}>{t("languagesTitleAccent")}</em>
              </h2>
              <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5 }}>
                {t("languagesBlurb")}
              </p>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {LANGUAGES.map((lang) => {
                const on = language === lang.code;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => setLanguage(lang.code)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "16px 18px", borderRadius: 14,
                      border: on ? "1px solid var(--terra)" : "0.5px solid var(--line)",
                      background: on ? "var(--terra-soft)" : "var(--card)",
                      color: "var(--ink)",
                      cursor: "pointer", fontFamily: "inherit", fontSize: 15, fontWeight: 500,
                      minHeight: 44,
                    }}
                  >
                    <span>{t(lang.key)}</span>
                    {on && <Check size={16} style={{ color: "var(--terra)" }} />}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {error && (
          <p style={{ marginTop: 16, color: "var(--rose)", fontSize: 14, fontWeight: 600 }}>{error}</p>
        )}
      </div>

      {/* Sticky footer */}
      <div style={{
        position: "fixed",
        left: 0, right: 0, bottom: 0,
        background: "var(--paper)",
        borderTop: "0.5px solid var(--line)",
        zIndex: 10,
      }}>
        <div style={{
          maxWidth: 560,
          margin: "0 auto",
          padding: "12px 20px max(12px, env(safe-area-inset-bottom))",
          paddingRight: 96, // clear the dev role switcher fixed at right:16
          display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {step === 1 && t("countCities", { n: counts[1] })}
            {step === 2 && t("countCredentials", { n: counts[2] })}
            {step === 3 && (language ? t(LANGUAGES.find((l) => l.code === language)!.key) : t("countLanguagePending"))}
          </span>
          <button
            type="button"
            onClick={next}
            disabled={!canAdvance() || submitting}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "12px 20px", borderRadius: 14, border: "none",
              background: canAdvance() && !submitting ? "var(--ink)" : "var(--ink-4)",
              color: "var(--paper)",
              fontWeight: 600, fontSize: 14, cursor: canAdvance() && !submitting ? "pointer" : "not-allowed",
              opacity: submitting ? 0.6 : 1, fontFamily: "inherit", minHeight: 44,
            }}
          >
            {submitting ? t("saving") : step < 3 ? t("continue") : t("finish")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  icon,
  children,
}: {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section style={{
      background: "var(--card)", border: "0.5px solid var(--line)",
      borderRadius: 18, padding: 18, display: "grid", gap: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {icon}
        <Eyebrow>{title}</Eyebrow>
      </div>
      {hint && (
        <p style={{ margin: 0, fontSize: 13, color: "var(--ink-2)", lineHeight: 1.45 }}>{hint}</p>
      )}
      {children}
    </section>
  );
}

function Tags({ values, onRemove }: { values: string[]; onRemove: (v: string) => void }) {
  if (values.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {values.map((v) => (
        <span
          key={v}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "7px 12px", borderRadius: 999,
            background: "var(--terra-soft)", color: "var(--terra)",
            fontSize: 13, fontWeight: 500, border: "0.5px solid #F2C7B0",
          }}
        >
          {v}
          <button
            type="button"
            onClick={() => onRemove(v)}
            aria-label={`Remove ${v}`}
            style={{ border: 0, background: "none", color: "var(--terra)", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", opacity: 0.65 }}
          >
            <X size={12} />
          </button>
        </span>
      ))}
    </div>
  );
}

function SuggestRow({ suggestions, onPick }: { suggestions: string[]; onPick: (s: string) => void }) {
  if (suggestions.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {suggestions.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "6px 10px", borderRadius: 999,
            border: "0.5px dashed var(--line)", background: "transparent",
            color: "var(--ink-2)", cursor: "pointer", fontSize: 12, fontWeight: 500,
            fontFamily: "inherit",
          }}
        >
          <Plus size={11} />
          {s}
        </button>
      ))}
    </div>
  );
}

function AddInput({
  placeholder,
  value,
  onChange,
  onAdd,
  addLabel,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAdd(); } }}
        style={{
          flex: 1, borderRadius: 10, padding: "11px 14px",
          border: "0.5px solid var(--line)", background: "#fff",
          color: "var(--ink)", fontSize: 14, font: "inherit", outline: "none", minHeight: 44,
        }}
      />
      <button
        type="button"
        onClick={onAdd}
        disabled={!value.trim()}
        style={{
          border: 0, borderRadius: 10, padding: "11px 18px",
          background: "var(--ink)", color: "var(--paper)",
          fontWeight: 600, fontSize: 14, cursor: value.trim() ? "pointer" : "default",
          opacity: value.trim() ? 1 : 0.4, fontFamily: "inherit", minHeight: 44,
        }}
      >
        {addLabel}
      </button>
    </div>
  );
}
