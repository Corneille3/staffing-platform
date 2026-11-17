"use client";

import { useRouter } from "../../../../../i18n/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Eyebrow } from "../../../../../components/ui";
import { HideOnReadOnlyVisit, ReadOnlyVisitNotice } from "../../../../../components/read-only-visit";
import { inviteWorker } from "../../../../../lib/browser-api";
import { Worker } from "../../../../../lib/types";

const FIELD: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "12px 14px",
  borderRadius: "var(--r-sm)",
  border: "0.5px solid var(--line)",
  background: "var(--card)",
  color: "var(--ink)",
  fontSize: 15,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "var(--ui)",
};

const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
  marginBottom: 6,
  fontWeight: 500,
};

const PRIMARY_BTN: React.CSSProperties = {
  padding: "12px 24px",
  borderRadius: 999,
  border: 0,
  background: "var(--terra)",
  color: "var(--paper)",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 500,
};

const SECONDARY_BTN: React.CSSProperties = {
  padding: "12px 24px",
  borderRadius: 999,
  border: "0.5px solid var(--line)",
  background: "transparent",
  color: "var(--ink)",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 500,
};

export default function InviteWorkerPage() {
  return (
    <HideOnReadOnlyVisit fallback={<ReadOnlyVisitNotice />}>
      <InviteWorkerPageForm />
    </HideOnReadOnlyVisit>
  );
}

function InviteWorkerPageForm() {
  const router = useRouter();
  const t = useTranslations("apf.workerForm");
  const tf = useTranslations("apf.forms");
  const tp = useTranslations("apf.pool");
  const tc = useTranslations("common");
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    preferred_language: "fr",
    employment_type: "contractor",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Worker | null>(null);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const worker = await inviteWorker({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        preferred_language: form.preferred_language,
        employment_type: form.employment_type as "permanent" | "contractor",
      });
      setCreated(worker);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "40px 0" }}>
        <div
          style={{
            background: "var(--moss-soft)",
            border: "0.5px solid var(--moss)",
            borderRadius: "var(--r-lg)",
            padding: "32px 28px",
          }}
        >
          <Eyebrow style={{ color: "var(--moss)", marginBottom: 10 }}>{t("createdEyebrow")}</Eyebrow>
          <h2
            style={{
              margin: "0 0 8px",
              fontFamily: "var(--serif)",
              fontSize: 28,
              fontWeight: 400,
              color: "var(--ink)",
            }}
          >
            {created.first_name} {created.last_name}
          </h2>
          <p style={{ margin: "0 0 24px", color: "var(--ink-2)", lineHeight: 1.55 }}>
            {t("createdBody", { email: created.email })}
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              type="button"
              onClick={() => {
                setCreated(null);
                setForm({ first_name: "", last_name: "", email: "", phone: "", preferred_language: "fr", employment_type: "contractor" });
              }}
              style={SECONDARY_BTN}
            >
              {tf("addAnother")}
            </button>
            <button type="button" onClick={() => router.push("/apf/substitutes")} style={PRIMARY_BTN}>
              {t("back")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 0" }}>
      <Eyebrow style={{ marginBottom: 12 }}>{tp("eyebrow")}</Eyebrow>
      <h1
        style={{
          margin: 0,
          fontFamily: "var(--serif)",
          fontSize: 36,
          lineHeight: 1.05,
          fontWeight: 400,
          color: "var(--ink)",
        }}
      >
        {t.rich("title", { em: (chunks) => <em style={{ fontStyle: "italic" }}>{chunks}</em> })}
      </h1>
      <p style={{ margin: "12px 0 36px", color: "var(--ink-2)", lineHeight: 1.55, fontSize: 15 }}>
        {t("body")}
      </p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={LABEL}>{tf("firstName")}</label>
            <input
              required
              style={FIELD}
              value={form.first_name}
              onChange={(e) => set("first_name", e.target.value)}
            />
          </div>
          <div>
            <label style={LABEL}>{tf("lastName")}</label>
            <input
              required
              style={FIELD}
              value={form.last_name}
              onChange={(e) => set("last_name", e.target.value)}
            />
          </div>
        </div>

        <div>
          <label style={LABEL}>{tf("email")}</label>
          <input
            required
            type="email"
            style={FIELD}
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>

        <div>
          <label style={LABEL}>{tf("phoneOptional")}</label>
          <input
            type="tel"
            style={FIELD}
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="+1 555 000 0000"
          />
        </div>

        <div>
          <label style={LABEL}>{tf("preferredLanguage")}</label>
          <select
            style={{ ...FIELD, appearance: "none" }}
            value={form.preferred_language}
            onChange={(e) => set("preferred_language", e.target.value)}
          >
            <option value="fr">{tf("french")}</option>
            <option value="en">{tf("english")}</option>
          </select>
        </div>

        <div>
          <label style={LABEL}>{t("employmentType")}</label>
          <select
            style={{ ...FIELD, appearance: "none" }}
            value={form.employment_type}
            onChange={(e) => set("employment_type", e.target.value)}
          >
            <option value="contractor">{t("contractor")}</option>
            <option value="permanent">{t("permanent")}</option>
          </select>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--ink-3)", lineHeight: 1.4 }}>
            {t("employmentHint")}
          </p>
        </div>

        {error && <p style={{ margin: 0, color: "var(--rose)", fontSize: 14 }}>{error}</p>}

        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <button type="button" onClick={() => router.push("/apf/substitutes")} style={SECONDARY_BTN}>
            {tc("cancel")}
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{ ...PRIMARY_BTN, flex: 1, opacity: submitting ? 0.6 : 1, cursor: submitting ? "not-allowed" : "pointer" }}
          >
            {submitting ? t("adding") : t("submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
