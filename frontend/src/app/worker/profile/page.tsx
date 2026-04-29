"use client";

import { useWorkerSession } from "../../../lib/worker-session";

export default function WorkerProfilePage() {
  const { worker } = useWorkerSession();

  if (!worker) return null;

  function signOut() {
    window.localStorage.removeItem("apf.workerId");
    window.location.reload();
  }

  return (
    <div style={{ display: "grid", gap: 24, paddingTop: 16 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 26 }}>Profile</h1>
        <p style={{ margin: "6px 0 0", color: "#496158" }}>
          Your contact details and qualifications. Editing comes soon.
        </p>
      </header>

      <Card>
        <Field label="Name" value={`${worker.first_name} ${worker.last_name}`} />
        <Field label="Email" value={worker.email} />
        <Field label="Preferred language" value={worker.preferred_language.toUpperCase()} />
      </Card>

      <Card>
        <Field
          label="Cities I can work in"
          value={worker.profile?.supported_cities.join(", ") || "—"}
        />
        <Field label="Qualifications" value={worker.profile?.qualifications.join(", ") || "—"} />
        <Field label="Certifications" value={worker.profile?.certifications.join(", ") || "—"} />
        <Field
          label="Urgent alerts"
          value={worker.profile?.urgent_alert_opt_in ? "Yes" : "No"}
        />
      </Card>

      <button
        type="button"
        onClick={signOut}
        style={{
          border: 0,
          borderRadius: 14,
          padding: "16px 18px",
          background: "#eadfd7",
          color: "#7a473f",
          fontSize: 15,
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        Sign out
      </button>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section
      style={{
        background: "#fffdf7",
        borderRadius: 20,
        padding: 18,
        boxShadow: "0 8px 18px rgba(24, 50, 41, 0.08)",
        display: "grid",
        gap: 14,
      }}
    >
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        style={{
          margin: 0,
          fontSize: 11,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "#5d6d66",
        }}
      >
        {label}
      </p>
      <p style={{ margin: "4px 0 0", fontSize: 16, color: "#183229" }}>{value}</p>
    </div>
  );
}
