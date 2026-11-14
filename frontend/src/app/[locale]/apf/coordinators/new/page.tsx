"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Eyebrow } from "../../../../../components/ui";
import { HideOnReadOnlyVisit, ReadOnlyVisitNotice } from "../../../../../components/read-only-visit";
import { fetchOrganizationsForTenant, inviteCoordinator } from "../../../../../lib/browser-api";
import { Coordinator, Organization } from "../../../../../lib/types";

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

export default function InviteCoordinatorPage() {
  return (
    <HideOnReadOnlyVisit fallback={<ReadOnlyVisitNotice />}>
      <InviteCoordinatorPageForm />
    </HideOnReadOnlyVisit>
  );
}

function InviteCoordinatorPageForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    preferred_language: "fr",
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
      prev.includes(orgId) ? prev.filter((id) => id !== orgId) : [...prev, orgId],
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
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "40px 0" }}>
        <div
          style={{
            background: "var(--moss-soft)",
            border: "0.5px solid var(--moss)",
            borderRadius: "var(--r-lg)",
            padding: "32px 28px",
          }}
        >
          <Eyebrow style={{ color: "var(--moss)", marginBottom: 10 }}>Coordinator invited</Eyebrow>
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
          <p style={{ margin: "0 0 12px", color: "var(--ink-2)" }}>{created.email}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 24 }}>
            {created.organizations.map((org) => (
              <span
                key={org.id}
                style={{
                  padding: "3px 10px",
                  borderRadius: 999,
                  background: "var(--paper)",
                  color: "var(--ink)",
                  fontSize: 12,
                  fontWeight: 500,
                  border: "0.5px solid var(--line)",
                }}
              >
                {org.name}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              type="button"
              onClick={() => {
                setCreated(null);
                setForm({ first_name: "", last_name: "", email: "", phone: "", preferred_language: "fr" });
                setSelectedOrgIds([]);
              }}
              style={SECONDARY_BTN}
            >
              Invite another
            </button>
            <button type="button" onClick={() => router.push("/apf/coordinators")} style={PRIMARY_BTN}>
              Back to coordinators
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
        Invite a <em style={{ fontStyle: "italic" }}>coordinator</em>
      </h1>
      <p style={{ margin: "12px 0 36px", color: "var(--ink-2)", lineHeight: 1.55, fontSize: 15 }}>
        Coordinators manage coverage requests for their organizations. They&apos;ll sign in with this email to access their dashboard.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={LABEL}>First name</label>
            <input
              required
              style={FIELD}
              value={form.first_name}
              onChange={(e) => set("first_name", e.target.value)}
            />
          </div>
          <div>
            <label style={LABEL}>Last name</label>
            <input
              required
              style={FIELD}
              value={form.last_name}
              onChange={(e) => set("last_name", e.target.value)}
            />
          </div>
        </div>

        <div>
          <label style={LABEL}>Email address</label>
          <input
            required
            type="email"
            style={FIELD}
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>

        <div>
          <label style={LABEL}>Phone (optional)</label>
          <input
            type="tel"
            style={FIELD}
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="+1 555 000 0000"
          />
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

        <div>
          <label style={LABEL}>Assign to organizations</label>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--ink-3)" }}>
            Select one or more organizations this coordinator will manage.
          </p>
          {orgs.length === 0 ? (
            <p
              style={{
                fontSize: 13,
                color: "var(--ink-3)",
                padding: "12px 14px",
                borderRadius: "var(--r-sm)",
                border: "0.5px solid var(--line)",
                background: "var(--card)",
              }}
            >
              No organizations yet.{" "}
              <a href="/apf/organizations/new" style={{ color: "var(--terra)", textDecoration: "none" }}>
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
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 16px",
                      borderRadius: "var(--r-sm)",
                      cursor: "pointer",
                      textAlign: "left",
                      border: selected
                        ? "0.5px solid var(--terra)"
                        : "0.5px solid var(--line)",
                      background: selected ? "var(--terra-soft)" : "var(--card)",
                      color: "var(--ink)",
                      fontFamily: "var(--ui)",
                    }}
                  >
                    <span
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        flexShrink: 0,
                        border: selected ? "0.5px solid var(--terra)" : "0.5px solid var(--ink-4)",
                        background: selected ? "var(--terra)" : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        color: "var(--paper)",
                        fontWeight: 700,
                      }}
                    >
                      {selected ? "✓" : ""}
                    </span>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 14 }}>{org.name}</div>
                      <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 1 }}>{org.city}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && <p style={{ margin: 0, color: "var(--rose)", fontSize: 14 }}>{error}</p>}

        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <button type="button" onClick={() => router.push("/apf/coordinators")} style={SECONDARY_BTN}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{ ...PRIMARY_BTN, flex: 1, opacity: submitting ? 0.6 : 1, cursor: submitting ? "not-allowed" : "pointer" }}
          >
            {submitting ? "Inviting…" : "Invite coordinator"}
          </button>
        </div>
      </form>
    </div>
  );
}
