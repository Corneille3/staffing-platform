"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { inviteWorker } from "../../../../../lib/browser-api";
import { Worker } from "../../../../../lib/types";

const FIELD: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(247,240,223,0.18)",
  background: "rgba(247,240,223,0.07)",
  color: "#f7f0df",
  fontSize: 15,
  outline: "none",
  boxSizing: "border-box",
};

const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  opacity: 0.7,
  marginBottom: 6,
};

export default function InviteWorkerPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    preferred_language: "fr",
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
      });
      setCreated(worker);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to invite worker");
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <main style={{ maxWidth: 560, margin: "0 auto", padding: "60px 20px" }}>
        <div
          style={{
            background: "rgba(164,200,163,0.15)",
            border: "1px solid rgba(164,200,163,0.4)",
            borderRadius: 16,
            padding: "32px 28px",
          }}
        >
          <p style={{ margin: "0 0 6px", fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: "#a4c8a3" }}>
            Substitute added
          </p>
          <h2 style={{ margin: "0 0 8px", fontSize: 26 }}>
            {created.first_name} {created.last_name}
          </h2>
          <p style={{ margin: "0 0 24px", opacity: 0.75 }}>
            {created.email} — they can now sign up at the platform URL using this email address. Once they sign in, they&apos;ll be prompted to complete their profile.
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              type="button"
              onClick={() => { setCreated(null); setForm({ first_name: "", last_name: "", email: "", phone: "", preferred_language: "fr" }); }}
              style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(247,240,223,0.3)", background: "transparent", color: "#f7f0df", cursor: "pointer", fontSize: 14 }}
            >
              Add another
            </button>
            <button
              type="button"
              onClick={() => router.push("/apf/substitutes")}
              style={{ padding: "10px 20px", borderRadius: 10, border: 0, background: "#f7f0df", color: "#183229", cursor: "pointer", fontSize: 14, fontWeight: 700 }}
            >
              Back to pool
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "60px 20px" }}>
      <p style={{ margin: "0 0 8px", fontSize: 12, letterSpacing: "0.24em", textTransform: "uppercase", opacity: 0.6 }}>
        Substitute Pool
      </p>
      <h1 style={{ margin: "0 0 6px", fontSize: 32 }}>Add a substitute</h1>
      <p style={{ margin: "0 0 36px", opacity: 0.72, lineHeight: 1.55 }}>
        Enter the substitute&apos;s details. They&apos;ll be added to your network and can sign in with this email to complete their profile.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={LABEL}>First name</label>
            <input required style={FIELD} value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
          </div>
          <div>
            <label style={LABEL}>Last name</label>
            <input required style={FIELD} value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
          </div>
        </div>

        <div>
          <label style={LABEL}>Email address</label>
          <input required type="email" style={FIELD} value={form.email} onChange={(e) => set("email", e.target.value)} />
        </div>

        <div>
          <label style={LABEL}>Phone (optional)</label>
          <input type="tel" style={FIELD} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+1 555 000 0000" />
        </div>

        <div>
          <label style={LABEL}>Preferred language</label>
          <select
            style={{ ...FIELD, appearance: "none" }}
            value={form.preferred_language}
            onChange={(e) => set("preferred_language", e.target.value)}
          >
            <option value="fr">French (FR)</option>
            <option value="en">English (EN)</option>
          </select>
        </div>

        {error && (
          <p style={{ margin: 0, color: "#ffb1a0", fontSize: 14 }}>{error}</p>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <button
            type="button"
            onClick={() => router.push("/apf/substitutes")}
            style={{ padding: "12px 24px", borderRadius: 12, border: "1px solid rgba(247,240,223,0.3)", background: "transparent", color: "#f7f0df", cursor: "pointer", fontSize: 15 }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{ flex: 1, padding: "12px 24px", borderRadius: 12, border: 0, background: "#f7f0df", color: "#183229", cursor: submitting ? "not-allowed" : "pointer", fontSize: 15, fontWeight: 800, opacity: submitting ? 0.7 : 1 }}
          >
            {submitting ? "Adding…" : "Add substitute"}
          </button>
        </div>
      </form>
    </main>
  );
}
