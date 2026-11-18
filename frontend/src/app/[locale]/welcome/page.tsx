"use client";

import { useEffect, useState } from "react";
import { useRouter } from "../../../i18n/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, Bell, Check } from "lucide-react";
import {
  bulkInviteSubstitutes,
  completeTenantOnboarding,
  createOrganization,
  fetchOrganizationsForTenant,
  fetchTenantProfile,
  inviteCoordinator,
  patchAdminOrganization,
  patchTenantProfile,
} from "../../../lib/browser-api";
import type { Organization, TenantProfile } from "../../../lib/types";

// Values only — step names come from `welcome.steps`, organization types
// from `admin.organizations.types`, languages from `admin.languageNames`.
const STEPS = ["name", "org", "coordinator", "substitutes"] as const;

const ORG_TYPES = ["childcare", "long_term_care", "assisted_living", "home_care", "community_care", "other"];

const LANG_CODES = ["fr", "en", "bilingual"] as const;

// Parse a pasted substitute line: "First Last, email", "Name <email>", or just
// "email" (name derived from the local part). Lines without an email are skipped.
function parseSubLine(line: string): { first_name: string; last_name: string; email: string; preferred_language: string } | null {
  const m = line.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (!m) return null;
  const email = m[0];
  let namePart = line.replace(email, "").replace(/[<>,]/g, " ").trim();
  if (!namePart) namePart = email.split("@")[0].replace(/[._]/g, " ").trim();
  const parts = namePart.split(/\s+/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  return {
    first_name: parts[0] || "Substitute",
    last_name: parts.slice(1).join(" ") || "Substitute",
    email,
    preferred_language: "fr",
  };
}

export default function WelcomeWizard() {
  const router = useRouter();
  const t = useTranslations("welcome");
  const tTypes = useTranslations("admin.organizations.types");
  const tLang = useTranslations("admin.languageNames");
  const em = (chunks: React.ReactNode) => <em style={emItal}>{chunks}</em>;
  const LANGS = LANG_CODES.map((value) => ({ value, label: tLang(value) }));
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<TenantProfile | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [language, setLanguage] = useState<"fr" | "en" | "bilingual">("fr");
  // Step 2
  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState("childcare");
  const [orgCity, setOrgCity] = useState("");
  const [orgLang, setOrgLang] = useState<"fr" | "en" | "bilingual">("fr");
  const [orgAddress, setOrgAddress] = useState("");
  // The org created in step 2, so returning to the step updates it instead of
  // creating a duplicate (the wizard's step rail + Back button let you revisit).
  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null);
  // Step 3
  const [coordFirst, setCoordFirst] = useState("");
  const [coordLast, setCoordLast] = useState("");
  const [coordEmail, setCoordEmail] = useState("");
  const [coordOrgId, setCoordOrgId] = useState<string>("");
  // Step 4
  const [subsText, setSubsText] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const p = await fetchTenantProfile();
        if (p.status === "active") {
          router.replace("/apf");
          return;
        }
        setProfile(p);
        setName(p.name);
        setRegion(p.region ?? "");
        setLanguage((p.preferred_language as "fr" | "en" | "bilingual") || "fr");
        setOrgCity("");
        setOrgs(await fetchOrganizationsForTenant().catch(() => []));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("loadFailed"));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function next() {
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function back() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function saveStep1() {
    setBusy(true);
    setError(null);
    try {
      await patchTenantProfile({ name: name.trim(), region: region.trim() || null, preferred_language: language });
      next();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function saveStep2() {
    if (!orgName.trim() || !orgCity.trim()) {
      setError(t("orgRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (createdOrgId) {
        // Revisiting step 2 — update the org we already made rather than
        // creating a second one. city/type are fixed at creation (same as the
        // §2.3 edit modal), so only the editable fields are sent.
        await patchAdminOrganization(createdOrgId, {
          name: orgName.trim(),
          preferred_language: orgLang,
          address_line1: orgAddress.trim() || null,
        });
        setOrgs((prev) =>
          prev.map((o) =>
            o.id === createdOrgId ? { ...o, name: orgName.trim(), preferred_language: orgLang } : o,
          ),
        );
      } else {
        const org = await createOrganization({
          name: orgName.trim(), type: orgType, city: orgCity.trim(),
          preferred_language: orgLang, address_line1: orgAddress.trim() || null,
        });
        setCreatedOrgId(org.id);
        setOrgs((prev) => [...prev, org]);
        if (!coordOrgId) setCoordOrgId(org.id);
      }
      next();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("orgFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function saveStep3() {
    if (!coordFirst.trim() || !coordLast.trim() || !coordEmail.trim() || !coordOrgId) {
      setError(t("coordRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await inviteCoordinator({
        first_name: coordFirst.trim(), last_name: coordLast.trim(),
        email: coordEmail.trim(), preferred_language: "fr", org_ids: [coordOrgId],
      });
      next();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("coordFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const invitees = subsText.split("\n").map(parseSubLine).filter(Boolean) as ReturnType<typeof parseSubLine>[];
      if (invitees.length > 0) {
        await bulkInviteSubstitutes(invitees as { first_name: string; last_name: string; email: string; preferred_language: string }[]);
      }
      await completeTenantOnboarding();
      setFinished(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("finishFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <Centered>{t("loading")}</Centered>;
  }
  if (error && !profile) {
    return <Centered>{error}</Centered>;
  }
  if (finished) {
    const subCount = subsText.split("\n").map(parseSubLine).filter(Boolean).length;
    return <FinishScreen networkName={name} subCount={subCount} hasOrg={orgs.length > 0} onGo={() => router.push("/apf")} />;
  }

  const subInviteCount = subsText.split("\n").map(parseSubLine).filter(Boolean).length;

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", display: "flex", fontFamily: "var(--ui)", color: "var(--ink)" }}>
      {/* Left rail — progress */}
      <aside style={{ width: 340, flexShrink: 0, background: "#15140F", color: "var(--paper)", padding: "40px 36px", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 48 }}>
          <span style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 400 }}>Staffig</span>
        </div>
        <div style={eyebrowDark}>{t("eyebrow")}</div>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 32, lineHeight: 1.1, margin: "10px 0 14px" }}>
          {t.rich("title", { name: name || profile?.name || "", em })}
        </h1>
        <p style={{ fontSize: 14, color: "rgba(246,244,238,.65)", lineHeight: 1.55, marginBottom: 40 }}>
          {t("intro")}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {STEPS.map((s, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <button key={s} onClick={() => i <= step && setStep(i)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", opacity: done || active ? 1 : 0.5, background: "transparent", border: "none", cursor: i <= step ? "pointer" : "default", textAlign: "left", fontFamily: "inherit", color: "var(--paper)" }}>
                <div style={{ width: 28, height: 28, borderRadius: 99, flexShrink: 0, background: done ? "var(--moss)" : active ? "var(--terra)" : "rgba(255,255,255,.08)", border: !done && !active ? "0.5px solid rgba(255,255,255,.2)" : "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: "#fff" }}>
                  {done ? <Check size={14} strokeWidth={2.4} /> : i + 1}
                </div>
                <span style={{ fontSize: 14, fontWeight: active ? 600 : 400 }}>{t(`steps.${s}`)}</span>
              </button>
            );
          })}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11, color: "rgba(246,244,238,.4)", lineHeight: 1.5 }}>
          {t("slugNote", { slug: profile?.slug ?? "" })}
        </div>
      </aside>

      {/* Right — current step */}
      <main style={{ flex: 1, minWidth: 0, padding: "56px 64px", display: "flex", flexDirection: "column" }}>
        <div style={{ maxWidth: 560, width: "100%" }}>
          <div style={eyebrow}>{t("stepOf", { n: step + 1, total: STEPS.length })}</div>

          {step === 0 && (
            <StepWrap title={t.rich("s1.title", { em })} blurb={t("s1.blurb")}>
              <Field label={t("s1.name")}><input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} /></Field>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
                <Field label={t("s1.address")}>
                  <input value={profile?.slug ?? ""} readOnly style={{ ...inputStyle, color: "var(--ink-3)", background: "var(--paper-2)" }} />
                </Field>
                <Field label={t("s1.region")}><input value={region} onChange={(e) => setRegion(e.target.value)} style={inputStyle} /></Field>
              </div>
              <Field label={t("s1.language")}><Toggle options={LANGS} value={language} onChange={setLanguage} /></Field>
            </StepWrap>
          )}

          {step === 1 && (
            <StepWrap title={t.rich("s2.title", { em })} blurb={t("s2.blurb")}>
              <Field label={t("s2.name")}><input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="CPE La Clairière" style={inputStyle} /></Field>
              <Field label={t("s2.type")}><ChipRow options={ORG_TYPES.map((value) => ({ value, label: tTypes(value) }))} value={orgType} onChange={setOrgType} pill /></Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <Field label={t("s2.city")}><input value={orgCity} onChange={(e) => setOrgCity(e.target.value)} placeholder="Saint-Jérôme" style={inputStyle} /></Field>
                <Field label={t("s2.language")}><Toggle options={LANGS.map((l) => ({ ...l, label: l.value.toUpperCase() }))} value={orgLang} onChange={setOrgLang} /></Field>
              </div>
              <Field label={t("s2.address")}><input value={orgAddress} onChange={(e) => setOrgAddress(e.target.value)} placeholder="123 rue Principale" style={inputStyle} /></Field>
            </StepWrap>
          )}

          {step === 2 && (
            <StepWrap title={t.rich("s3.title", { em })} blurb={t("s3.blurb")}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <Field label={t("s3.firstName")}><input value={coordFirst} onChange={(e) => setCoordFirst(e.target.value)} style={inputStyle} /></Field>
                <Field label={t("s3.lastName")}><input value={coordLast} onChange={(e) => setCoordLast(e.target.value)} style={inputStyle} /></Field>
              </div>
              <Field label={t("s3.email")}><input type="email" value={coordEmail} onChange={(e) => setCoordEmail(e.target.value)} placeholder="coordonnatrice@cpe.ca" style={inputStyle} /></Field>
              <Field label={t("s3.which")}>
                {orgs.length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--ink-3)" }}>{t("s3.needOrg")}</div>
                ) : (
                  <ChipRow options={orgs.map((o) => ({ value: o.id, label: o.name }))} value={coordOrgId} onChange={setCoordOrgId} pill />
                )}
              </Field>
              <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.5 }}>
                {t("s3.selfNote")}
              </div>
            </StepWrap>
          )}

          {step === 3 && (
            <StepWrap title={t.rich("s4.title", { em })} blurb={t("s4.blurb")}>
              <Field label={t("s4.emails")}>
                <textarea value={subsText} onChange={(e) => setSubsText(e.target.value)} rows={6} placeholder={"amelie.tremblay@gmail.com\nNoor Khan, noor.k@outlook.com"} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6, fontFamily: "var(--mono)", fontSize: 13 }} />
              </Field>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "var(--sand-soft)", borderRadius: 12, marginTop: 6 }}>
                <Bell size={16} strokeWidth={1.6} color="#7C5C12" />
                <div style={{ fontSize: 12.5, color: "#7C5C12", lineHeight: 1.4 }}>
                  {subInviteCount > 0 ? t("s4.ready", { count: subInviteCount }) : t("s4.paste")} {t("s4.profileNote")}
                </div>
              </div>
            </StepWrap>
          )}

          {error ? <p style={{ margin: "16px 0 0", color: "var(--rose)", fontSize: 13 }}>{error}</p> : null}
        </div>

        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 560, marginTop: 40 }}>
          <button onClick={back} style={{ ...ghostBtn, opacity: step === 0 ? 0.4 : 1, pointerEvents: step === 0 ? "none" : "auto" }}>
            <ArrowLeft size={14} /> {t("back")}
          </button>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {step >= 1 && step < STEPS.length - 1 && (
              <button onClick={next} style={{ background: "transparent", border: "none", color: "var(--ink-3)", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>{t("skip")}</button>
            )}
            <button
              onClick={step === 0 ? saveStep1 : step === 1 ? saveStep2 : step === 2 ? saveStep3 : finish}
              disabled={busy}
              style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}
            >
              {step === STEPS.length - 1
                ? <>{busy ? t("finishing") : t("finish")} <Check size={14} strokeWidth={2.2} /></>
                : <>{busy ? t("saving") : step === 0 ? t("continue") : t("saveContinue")} <ArrowRight size={14} /></>}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function FinishScreen({ networkName, subCount, hasOrg, onGo }: { networkName: string; subCount: number; hasOrg: boolean; onGo: () => void }) {
  const t = useTranslations("welcome.done");
  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--ui)", color: "var(--ink)", padding: 40 }}>
      <div style={{ textAlign: "center", maxWidth: 520 }}>
        <div style={{ width: 76, height: 76, borderRadius: 99, margin: "0 auto 26px", background: "var(--moss-soft)", color: "var(--moss)", display: "flex", alignItems: "center", justifyContent: "center", border: "0.5px solid #C8DCC1" }}>
          <Check size={32} strokeWidth={1.8} />
        </div>
        <div style={eyebrow}>{t("eyebrow")}</div>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 44, lineHeight: 1.05, margin: "10px 0 16px", letterSpacing: "-0.02em" }}>
          {t.rich("title", { name: networkName, em: (chunks) => <em style={emItal}>{chunks}</em> })}
        </h1>
        <p style={{ margin: "0 auto 32px", maxWidth: 420, color: "var(--ink-2)", fontSize: 15, lineHeight: 1.55 }}>
          {t("body")}
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 32, flexWrap: "wrap" }}>
          {[[hasOrg ? "1" : "0", t("org")], ["—", t("coordinator")], [String(subCount), t("subs", { count: subCount })]].map(([n, l]) => (
            <div key={l} style={{ padding: "14px 20px", background: "var(--card)", borderRadius: 14, border: "0.5px solid var(--line)", minWidth: 120 }}>
              <div style={{ fontFamily: "var(--serif)", fontSize: 32, lineHeight: 1 }}>{n}</div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6 }}>{l}</div>
            </div>
          ))}
        </div>
        <button onClick={onGo} style={{ ...primaryBtn, padding: "14px 24px" }}>{t("go")} <ArrowRight size={15} /></button>
      </div>
    </div>
  );
}

function StepWrap({ title, blurb, children }: { title: React.ReactNode; blurb: string; children: React.ReactNode }) {
  return (
    <>
      <h2 style={{ fontFamily: "var(--serif)", fontSize: "clamp(2rem, 4vw, 2.5rem)", lineHeight: 1.04, margin: "8px 0 8px", letterSpacing: "-0.02em" }}>{title}</h2>
      <p style={{ margin: "0 0 32px", color: "var(--ink-2)", fontSize: 15, lineHeight: 1.5 }}>{blurb}</p>
      {children}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 500, marginBottom: 9 }}>{label}</div>
      {children}
    </div>
  );
}

function Toggle<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)} style={{ flex: 1, padding: "9px 0", borderRadius: 10, cursor: "pointer", fontFamily: "var(--ui)", fontSize: 13, background: active ? "var(--ink)" : "#fff", color: active ? "var(--paper)" : "var(--ink)", border: `0.5px solid ${active ? "transparent" : "var(--line)"}` }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ChipRow({ options, value, onChange, pill }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void; pill?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)} style={{ padding: "9px 14px", borderRadius: pill ? 99 : 10, cursor: "pointer", fontFamily: "var(--ui)", fontSize: 13, background: active ? "var(--ink)" : "#fff", color: active ? "var(--paper)" : "var(--ink)", border: `0.5px solid ${active ? "transparent" : "var(--line)"}` }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-2)", fontSize: 14, fontFamily: "var(--ui)", padding: 40, textAlign: "center" }}>{children}</div>;
}

const emItal: React.CSSProperties = { fontStyle: "italic" };
const eyebrow: React.CSSProperties = { fontSize: 11, color: "var(--ink-3)", letterSpacing: ".14em", textTransform: "uppercase", fontWeight: 500 };
const eyebrowDark: React.CSSProperties = { fontSize: 11, color: "rgba(246,244,238,.5)", letterSpacing: ".14em", textTransform: "uppercase", fontWeight: 500 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "11px 14px", borderRadius: 10, border: "0.5px solid var(--line)", background: "var(--paper)", fontFamily: "var(--ui)", fontSize: 14, color: "var(--ink)", outline: "none", boxSizing: "border-box" };
const primaryBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "13px 22px", borderRadius: 999, background: "var(--ink)", border: 0, color: "var(--paper)", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "var(--ui)" };
const ghostBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "11px 16px", borderRadius: 999, background: "transparent", border: "0.5px solid var(--line)", color: "var(--ink)", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "var(--ui)" };
