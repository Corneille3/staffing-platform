"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchOrganizationsForTenant, inviteCoordinator } from "../../../../lib/browser-api";
import { Coordinator, Organization } from "../../../../lib/types";

const FIELD: React.CSSProperties = {
  display: "block", width: "100%", padding: "12px 14px", borderRadius: 10,
  border: "1px solid rgba(247,240,223,0.18)", background: "rgba(247,240,223,0.07)",
  color: "#f7f0df", fontSize: 15, outline: "none", boxSizing: "border-box",
};

const LABEL: React.CSSProperties = {
  display: "block", fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase",
  opacity: 0.7, marginBottom: 6,
};

export default function InviteCoordinatorPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", phone: "", preferred_language: "fr",
  });
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [selectedOrgIds, setSelectedOrgIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Coordinator | null>(null);

  useEffect(() => {
    fetchOrganizationsForTenant().then(setOrgs).catch(() => {});
  }, []);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function toggleOrg(orgId: string) {
    setSelectedOrgIds((prev) =>
      prev.includes(orgId) ? prev.filter((id) => id !== orgId) : [...prev, orgId]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedOrgIds.length === 0) {
      setError("Assign at least one organization.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const coordinator = await inviteCoordinator({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        preferred_language: form.preferred_language,
        org_ids: selectedOrgIds,
      });
      setCreated(coordinator);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to invite coordinator");
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <main style={{ maxWidth: 560, margin: "0 auto", padding: "60px 20px" }}>
        <div style={{ background: "rgba(164,200,163,0.15)", border: "1px solid rgba(164,200,163,0.4)", borderRadius: 16, padding: "32px 28px" }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: "#a4c8a3" }}>
            Coordinator invited
          </p>
          <h2 style={{ margin: "0 0 8px", fontSize: 26 }}>
            {created.first_name} {created.last_name}
          </h2>
          <p style={{ margin: "0 0 6px", opacity: 0.75 }}>{created.email}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 24 }}>
            {created.organizations.map((org) => (
              <span key={org.id} style={{ padding: "3px 10px", borderRadius: 999, background: "rgba(136,184,212,0.2)", color: "#88b8d4", fontSize: 12, fontWeight: 600 }}>
                {org.name}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              type="button"
              onClick={() => { setCreated(null); setForm({ first_name: "", last_name: "", email: "", phone: "", preferred_language: "fr" }); setSelectedOrgIds([]); }}
              style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(247,240,223,0.3)", background: "transparent", color: "#f7f0df", cursor: "pointer", fontSize: 14 }}
            >
              Invite another
            </button>
            <button
              type="button"
              onClick={() => router.push("/apf/coordinators")}
              style={{ padding: "10px 20px", borderRadius: 10, border: 0, background: "#f7f0df", color: "#183229", cursor: "pointer", fontSize: 14, fontWeight: 700 }}
            >
              Back to coordinators
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
      <h1 style={{ margin: "0 0 6px", fontSize: 32 }}>Invite a coordinator</h1>
      <p style={{ margin: "0 0 36px", opacity: 0.72, lineHeight: 1.55 }}>
        Coordinators manage coverage requests for their organizations. They&apos;ll sign in with this email to access their dashboard.
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
          <select style={{ ...FIELD, appearance: "none" }} value={form.preferred_language} onChange={(e) => set("preferred_language", e.target.value)}>
            <option value="fr">French (FR)</option>
            <option value="en">English (EN)</option>
          </select>
        </div>

        <div>
          <label style={LABEL}>Assign to organizations</label>
          <p style={{ margin: "0 0 12px", fontSize: 13, opacity: 0.6 }}>
            Select one or more organizations this coordinator will manage.
          </p>
          {orgs.length === 0 ? (
            <p style={{ fontSize: 13, opacity: 0.5, padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(247,240,223,0.18)" }}>
              No organizations yet.{" "}
              <a href="/apf/organizations/new" style={{ color: "#88b8d4", textDecoration: "none" }}>
                Create one first →
              </a>
            </p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {orgs.map((org) => {
                const selected = selectedOrgIds.includes(org.id);
                return (
                  <button
                    key={org.id}
                    type="button"
                    onClick={() => toggleOrg(org.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 16px", borderRadius: 12, cursor: "pointer", textAlign: "left",
                      border: selected ? "1.5px solid rgba(164,200,163,0.6)" : "1px solid rgba(247,240,223,0.18)",
                      background: selected ? "rgba(164,200,163,0.12)" : "rgba(247,240,223,0.04)",
                      color: "#f7f0df",
                    }}
                  >
                    <span style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                      border: selected ? "2px solid #a4c8a3" : "2px solid rgba(247,240,223,0.3)",
                      background: selected ? "#a4c8a3" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, color: "#183229", fontWeight: 800,
                    }}>
                      {selected ? "✓" : ""}
                    </span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{org.name}</div>
                      <div style={{ fontSize: 12, opacity: 0.55, marginTop: 1 }}>{org.city}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && <p style={{ margin: 0, color: "#ffb1a0", fontSize: 14 }}>{error}</p>}

        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <button
            type="button"
            onClick={() => router.push("/apf/coordinators")}
            style={{ padding: "12px 24px", borderRadius: 12, border: "1px solid rgba(247,240,223,0.3)", background: "transparent", color: "#f7f0df", cursor: "pointer", fontSize: 15 }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{ flex: 1, padding: "12px 24px", borderRadius: 12, border: 0, background: "#f7f0df", color: "#183229", cursor: submitting ? "not-allowed" : "pointer", fontSize: 15, fontWeight: 800, opacity: submitting ? 0.7 : 1 }}
          >
            {submitting ? "Inviting…" : "Invite coordinator"}
          </button>
        </div>
      </form>
    </main>
  );
}
