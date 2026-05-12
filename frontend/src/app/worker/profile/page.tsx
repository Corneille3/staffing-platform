"use client";

import { useClerk } from "@clerk/nextjs";
import { LogOut, MapPin } from "lucide-react";
import { useWorkerSession } from "../../../lib/worker-session";
import { Avatar, Eyebrow } from "../../../components/ui";

const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function WorkerProfilePage() {
  const { worker } = useWorkerSession();

  if (!worker) return null;

  const initials = `${worker.first_name[0]}${worker.last_name[0]}`.toUpperCase();

  return (
    <div style={{ display: "grid", gap: 24, paddingTop: 16 }}>
      {/* identity header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Avatar initials={initials} tone="terra" size={56} />
        <div>
          <div style={{ fontFamily: "var(--serif)", fontSize: 24, lineHeight: 1.1 }}>
            {worker.first_name}{" "}
            <em style={{ fontStyle: "italic" }}>{worker.last_name}</em>
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>{worker.email}</div>
        </div>
      </div>

      {/* contact card */}
      <section style={{
        background: "var(--card)",
        border: "0.5px solid var(--line)",
        borderRadius: 18,
        padding: 18,
        display: "grid",
        gap: 16,
      }}>
        <Eyebrow>Identity</Eyebrow>
        <Field label="First name" value={worker.first_name} />
        <Field label="Last name" value={worker.last_name} />
        <Field label="Email" value={worker.email} />
        <Field
          label="Language"
          value={worker.preferred_language === "fr" ? "Français" : "English"}
        />
      </section>

      {/* work profile card */}
      <section style={{
        background: "var(--card)",
        border: "0.5px solid var(--line)",
        borderRadius: 18,
        padding: 18,
        display: "grid",
        gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <MapPin size={14} style={{ color: "var(--ink-3)" }} />
          <Eyebrow>Work profile</Eyebrow>
        </div>
        <Field
          label="Cities"
          value={worker.profile?.supported_cities.join(", ") || "—"}
        />
        <Field
          label="Qualifications"
          value={worker.profile?.qualifications.join(", ") || "—"}
        />
        <Field
          label="Certifications"
          value={worker.profile?.certifications.join(", ") || "—"}
        />
        <Field
          label="Urgent alerts"
          value={worker.profile?.urgent_alert_opt_in
            ? (worker.preferred_language === "fr" ? "Activées" : "On")
            : (worker.preferred_language === "fr" ? "Désactivées" : "Off")}
        />
      </section>

      {CLERK_ENABLED ? <ClerkSignOutButton /> : <DevSignOutButton />}
    </div>
  );
}

function ClerkSignOutButton() {
  const { signOut } = useClerk();

  async function handleSignOut() {
    window.localStorage.removeItem("apf.workerId");
    window.localStorage.removeItem("apf.devRole");
    await signOut({ redirectUrl: "/sign-in" });
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      style={signOutStyle}
    >
      <LogOut size={15} />
      Sign out
    </button>
  );
}

function DevSignOutButton() {
  function handleSignOut() {
    window.localStorage.removeItem("apf.workerId");
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      style={signOutStyle}
    >
      <LogOut size={15} />
      Sign out
    </button>
  );
}

const signOutStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  border: "0.5px solid var(--line)",
  borderRadius: 14,
  padding: "14px 18px",
  background: "var(--card)",
  color: "var(--rose)",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  minHeight: 44,
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Eyebrow style={{ fontSize: 9, marginBottom: 4 }}>{label}</Eyebrow>
      <p style={{ margin: 0, fontSize: 15, color: "var(--ink)", fontWeight: 500 }}>{value}</p>
    </div>
  );
}
