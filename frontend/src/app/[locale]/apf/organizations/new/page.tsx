"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eyebrow } from "../../../../../components/ui";
import { HideOnReadOnlyVisit, ReadOnlyVisitNotice } from "../../../../../components/read-only-visit";
import { createOrganization } from "../../../../../lib/browser-api";
import { Organization } from "../../../../../lib/types";

const ORG_TYPES = [
  { value: "childcare", label: "Childcare" },
  { value: "long_term_care", label: "Long-term Care" },
  { value: "community_care", label: "Community Care" },
  { value: "home_care", label: "Home Care" },
  { value: "assisted_living", label: "Assisted Living" },
  { value: "other", label: "Other" },
];

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

export default function NewOrganizationPage() {
  return (
    <HideOnReadOnlyVisit fallback={<ReadOnlyVisitNotice />}>
      <NewOrganizationPageForm />
    </HideOnReadOnlyVisit>
  );
}

function NewOrganizationPageForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    type: "childcare",
    city: "",
    region: "",
    contact_email: "",
    contact_phone: "",
    preferred_language: "fr",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Organization | null>(null);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const org = await createOrganization({
        name: form.name.trim(),
        type: form.type,
        city: form.city.trim(),
        region: form.region.trim() || undefined,
        contact_email: form.contact_email.trim() || undefined,
        contact_phone: form.contact_phone.trim() || undefined,
        preferred_language: form.preferred_language,
      });
      setCreated(org);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create organization");
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
          <Eyebrow style={{ color: "var(--moss)", marginBottom: 10 }}>Organization created</Eyebrow>
          <h2
            style={{
              margin: "0 0 8px",
              fontFamily: "var(--serif)",
              fontSize: 28,
              fontWeight: 400,
              color: "var(--ink)",
            }}
          >
            {created.name}
          </h2>
          <p style={{ margin: "0 0 24px", color: "var(--ink-2)" }}>
            {created.city} · {created.type}
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              type="button"
              onClick={() => {
                setCreated(null);
                setForm({
                  name: "",
                  type: "childcare",
                  city: "",
                  region: "",
                  contact_email: "",
                  contact_phone: "",
                  preferred_language: "fr",
                });
              }}
              style={SECONDARY_BTN}
            >
              Add another
            </button>
            <button type="button" onClick={() => router.push("/apf/organizations")} style={PRIMARY_BTN}>
              Back to organizations
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 0" }}>
      <Eyebrow style={{ marginBottom: 12 }}>Network Management</Eyebrow>
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
        New <em style={{ fontStyle: "italic" }}>organization</em>
      </h1>
      <p style={{ margin: "12px 0 36px", color: "var(--ink-2)", lineHeight: 1.55, fontSize: 15 }}>
        Add a member organization to your network. You can assign coordinators to it once it&apos;s created.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 20 }}>
        <div>
          <label style={LABEL}>Organization name</label>
          <input
            required
            style={FIELD}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Garderie Les Étoiles"
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={LABEL}>Type</label>
            <select
              style={{ ...FIELD, appearance: "none" }}
              value={form.type}
              onChange={(e) => set("type", e.target.value)}
            >
              {ORG_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={LABEL}>Language</label>
            <select
              style={{ ...FIELD, appearance: "none" }}
              value={form.preferred_language}
              onChange={(e) => set("preferred_language", e.target.value)}
            >
              <option value="fr">French (FR)</option>
              <option value="en">English (EN)</option>
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={LABEL}>City</label>
            <input
              required
              style={FIELD}
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              placeholder="Montréal"
            />
          </div>
          <div>
            <label style={LABEL}>Region (optional)</label>
            <input
              style={FIELD}
              value={form.region}
              onChange={(e) => set("region", e.target.value)}
              placeholder="Île-de-Montréal"
            />
          </div>
        </div>

        <div>
          <label style={LABEL}>Contact email (optional)</label>
          <input
            type="email"
            style={FIELD}
            value={form.contact_email}
            onChange={(e) => set("contact_email", e.target.value)}
          />
        </div>

        <div>
          <label style={LABEL}>Contact phone (optional)</label>
          <input
            type="tel"
            style={FIELD}
            value={form.contact_phone}
            onChange={(e) => set("contact_phone", e.target.value)}
            placeholder="+1 555 000 0000"
          />
        </div>

        {error && <p style={{ margin: 0, color: "var(--rose)", fontSize: 14 }}>{error}</p>}

        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <button type="button" onClick={() => router.push("/apf/organizations")} style={SECONDARY_BTN}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{ ...PRIMARY_BTN, flex: 1, opacity: submitting ? 0.6 : 1, cursor: submitting ? "not-allowed" : "pointer" }}
          >
            {submitting ? "Creating…" : "Create organization"}
          </button>
        </div>
      </form>
    </div>
  );
}
