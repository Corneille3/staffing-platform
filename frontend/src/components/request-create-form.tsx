"use client";

import { useRouter } from "next/navigation";
import { CSSProperties } from "react";
import { FormEvent, useMemo, useState, useTransition } from "react";
import { Organization, User } from "../lib/types";

const browserApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function RequestCreateForm({
  organizations,
  users,
}: {
  organizations: Organization[];
  users: User[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const orgAdmins = useMemo(() => users.filter((user) => user.role === "org_admin"), [users]);
  const [error, setError] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id || "");
  const [createdByUserId, setCreatedByUserId] = useState(orgAdmins[0]?.id || "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState(organizations[0]?.city || "");
  const [locationName, setLocationName] = useState("");
  const [workDate, setWorkDate] = useState(todayIsoDate());
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("12:00");
  const [coverageType, setCoverageType] = useState("same_day_urgent");
  const [urgencyLevel, setUrgencyLevel] = useState("2");
  const [languageRequirement, setLanguageRequirement] = useState("fr");
  const [qualifications, setQualifications] = useState("ECE_LEVEL_1");
  const [certifications, setCertifications] = useState("FIRST_AID");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [arrivalInstructions, setArrivalInstructions] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const response = await fetch(`${browserApiBaseUrl}/api/v1/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organization_id: organizationId,
        created_by_user_id: createdByUserId,
        request_type: "urgent_replacement",
        coverage_type: coverageType,
        title,
        description: description || null,
        city,
        location_name: locationName || null,
        work_date: workDate,
        start_time: startTime,
        end_time: endTime,
        urgency_level: Number(urgencyLevel),
        language_requirement: languageRequirement || null,
        required_qualifications: splitList(qualifications),
        required_certifications: splitList(certifications),
        contact_name: contactName || null,
        contact_phone: contactPhone || null,
        contact_email: contactEmail || null,
        arrival_instructions: arrivalInstructions || null,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      setError(text || `Request creation failed with status ${response.status}`);
      return;
    }

    setTitle("");
    setDescription("");
    setLocationName("");
    startTransition(() => router.refresh());
  }

  const inputStyle: CSSProperties = {
    borderRadius: 12,
    border: "1px solid rgba(24, 50, 41, 0.18)",
    padding: "11px 12px",
    background: "#fffdf7",
    color: "#183229",
    font: "inherit",
    minWidth: 0,
  };

  const labelStyle: CSSProperties = {
    display: "grid",
    gap: 6,
    color: "#3d564c",
    fontSize: 14,
    fontWeight: 700,
  };

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
        <label style={labelStyle}>
          Organization
          <select
            value={organizationId}
            onChange={(event) => {
              const nextId = event.target.value;
              setOrganizationId(nextId);
              const organization = organizations.find((item) => item.id === nextId);
              if (organization) {
                setCity(organization.city);
              }
            }}
            style={inputStyle}
            required
          >
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </label>

        <label style={labelStyle}>
          Created by
          <select
            value={createdByUserId}
            onChange={(event) => setCreatedByUserId(event.target.value)}
            style={inputStyle}
            required
          >
            {orgAdmins.map((user) => (
              <option key={user.id} value={user.id}>
                {user.first_name} {user.last_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label style={labelStyle}>
        Title
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Educator replacement - afternoon shift"
          style={inputStyle}
          required
        />
      </label>

      <label style={labelStyle}>
        Notes
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Coverage details, group, or room notes"
          rows={3}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <label style={labelStyle}>
          City
          <input value={city} onChange={(event) => setCity(event.target.value)} style={inputStyle} required />
        </label>
        <label style={labelStyle}>
          Location
          <input value={locationName} onChange={(event) => setLocationName(event.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Date
          <input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} style={inputStyle} required />
        </label>
        <label style={labelStyle}>
          Start
          <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} style={inputStyle} required />
        </label>
        <label style={labelStyle}>
          End
          <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} style={inputStyle} required />
        </label>
        <label style={labelStyle}>
          Coverage type
          <select value={coverageType} onChange={(event) => setCoverageType(event.target.value)} style={inputStyle}>
            <option value="same_day_urgent">Same-day urgent</option>
            <option value="planned_absence">Planned absence</option>
            <option value="recurring">Recurring</option>
            <option value="emergency">Emergency</option>
          </select>
        </label>
        <label style={labelStyle}>
          Urgency
          <select value={urgencyLevel} onChange={(event) => setUrgencyLevel(event.target.value)} style={inputStyle}>
            <option value="1">Low</option>
            <option value="2">Standard</option>
            <option value="3">Urgent</option>
          </select>
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
        <label style={labelStyle}>
          Language
          <select
            value={languageRequirement}
            onChange={(event) => setLanguageRequirement(event.target.value)}
            style={inputStyle}
          >
            <option value="fr">French</option>
            <option value="en">English</option>
            <option value="bilingual">Bilingual</option>
          </select>
        </label>
        <label style={labelStyle}>
          Qualifications
          <input value={qualifications} onChange={(event) => setQualifications(event.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Certifications
          <input value={certifications} onChange={(event) => setCertifications(event.target.value)} style={inputStyle} />
        </label>
      </div>

      <div
        style={{
          borderTop: "1px solid rgba(24, 50, 41, 0.1)",
          paddingTop: 14,
          display: "grid",
          gap: 6,
        }}
      >
        <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#496158", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          On-site contact
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <label style={labelStyle}>
            Contact name
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Marie-Claude Bergeron" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Phone
            <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="514-555-0100" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Email
            <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="contact@org.ca" style={inputStyle} />
          </label>
        </div>
        <label style={labelStyle}>
          Arrival instructions
          <textarea
            value={arrivalInstructions}
            onChange={(e) => setArrivalInstructions(e.target.value)}
            placeholder="Enter through the side door, sign in at the front desk…"
            rows={2}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </label>
      </div>

      {error ? <p style={{ margin: 0, color: "#8c3f32", fontWeight: 700 }}>{error}</p> : null}

      <button
        type="submit"
        disabled={isPending || !organizationId || !createdByUserId}
        style={{
          border: 0,
          borderRadius: 12,
          padding: "13px 16px",
          background: "#183229",
          color: "#f7f0df",
          cursor: "pointer",
          fontWeight: 800,
          justifySelf: "start",
        }}
      >
        Create request
      </button>
    </form>
  );
}
