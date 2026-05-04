"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createOrganization } from "../../../../lib/browser-api";
import { Organization } from "../../../../lib/types";

const ORG_TYPES = [
  { value: "childcare", label: "Childcare" },
  { value: "long_term_care", label: "Long-term Care" },
  { value: "community_care", label: "Community Care" },
  { value: "home_care", label: "Home Care" },
  { value: "assisted_living", label: "Assisted Living" },
  { value: "other", label: "Other" },
];

const FIELD: React.CSSProperties = {
  display: "block", width: "100%", padding: "12px 14px", borderRadius: 10,
  border: "1px solid rgba(247,240,223,0.18)", background: "rgba(247,240,223,0.07)",
  color: "#f7f0df", fontSize: 15, outline: "none", boxSizing: "border-box",
};

const LABEL: React.CSSProperties = {
  display: "block", fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase",
  opacity: 0.7, marginBottom: 6,
};

export default function NewOrganizationPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "", type: "childcare", city: "", region: "",
    contact_email: "", contact_phone: "", preferred_language: "fr",
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
      <main style={{ maxWidth: 560, margin: "0 auto", padding: "60px 20px" }}>
        <div style={{ background: "rgba(164,200,163,0.15)", border: "1px solid rgba(164,200,163,0.4)", borderRadius: 16, padding: "32px 28px" }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: "#a4c8a3" }}>
            Organization created
          </p>
          <h2 style={{ margin: "0 0 8px", fontSize: 26 }}>{created.name}</h2>
          <p style={{ margin: "0 0 24px", opacity: 0.75 }}>
            {created.city} · {created.type}
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              type="button"
              onClick={() => { setCreated(null); setForm({ name: "", type: "childcare", city: "", region: "", contact_email: "", contact_phone: "", preferred_language: "fr" }); }}
              style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(247,240,223,0.3)", background: "transparent", color: "#f7f0df", cursor: "pointer", fontSize: 14 }}
            >
              Add another
            </button>
            <button
              type="button"
              onClick={() => router.push("/apf/organizations")}
              style={{ padding: "10px 20px", borderRadius: 10, border: 0, background: "#f7f0df", color: "#183229", cursor: "pointer", fontSize: 14, fontWeight: 700 }}
            >
              Back to organizations
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "60px 20px" }}>
      <p style={{ margin: "0 0 8px", fontSize: 12, letterSpacing: "0.24em", textTransform: "uppercase", opacity: 0.6 }}>
        Network Management
      </p>
      <h1 style={{ margin: "0 0 6px", fontSize: 32 }}>New organization</h1>
      <p style={{ margin: "0 0 36px", opacity: 0.72, lineHeight: 1.55 }}>
        Add a member organization to your network. You can assign coordinators to it once it&apos;s created.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 20 }}>
        <div>
          <label style={LABEL}>Organization name</label>
          <input required style={FIELD} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Garderie Les Étoiles" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={LABEL}>Type</label>
            <select style={{ ...FIELD, appearance: "none" }} value={form.type} onChange={(e) => set("type", e.target.value)}>
              {ORG_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={LABEL}>Language</label>
            <select style={{ ...FIELD, appearance: "none" }} value={form.preferred_language} onChange={(e) => set("preferred_language", e.target.value)}>
              <option value="fr">French (FR)</option>
              <option value="en">English (EN)</option>
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={LABEL}>City</label>
            <input required style={FIELD} value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Montréal" />
          </div>
          <div>
            <label style={LABEL}>Region (optional)</label>
            <input style={FIELD} value={form.region} onChange={(e) => set("region", e.target.value)} placeholder="Île-de-Montréal" />
          </div>
        </div>

        <div>
          <label style={LABEL}>Contact email (optional)</label>
          <input type="email" style={FIELD} value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} />
        </div>

        <div>
          <label style={LABEL}>Contact phone (optional)</label>
          <input type="tel" style={FIELD} value={form.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} placeholder="+1 555 000 0000" />
        </div>

        {error && <p style={{ margin: 0, color: "#ffb1a0", fontSize: 14 }}>{error}</p>}

        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <button
            type="button"
            onClick={() => router.push("/apf/organizations")}
            style={{ padding: "12px 24px", borderRadius: 12, border: "1px solid rgba(247,240,223,0.3)", background: "transparent", color: "#f7f0df", cursor: "pointer", fontSize: 15 }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{ flex: 1, padding: "12px 24px", borderRadius: 12, border: 0, background: "#f7f0df", color: "#183229", cursor: submitting ? "not-allowed" : "pointer", fontSize: 15, fontWeight: 800, opacity: submitting ? 0.7 : 1 }}
          >
            {submitting ? "Creating…" : "Create organization"}
          </button>
        </div>
      </form>
    </main>
  );
}
