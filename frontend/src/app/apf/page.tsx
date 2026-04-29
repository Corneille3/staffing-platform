import { getDashboardData } from "../../lib/api";

export default async function ApfHomePage() {
  const { summary, organizations, requests } = await getDashboardData();

  const assignedCount = requests.filter((request) => request.status === "assigned").length;
  const openCount = requests.filter((request) =>
    ["open", "notified", "responses_received"].includes(request.status),
  ).length;
  const fillRate = summary.request_count
    ? Math.round((assignedCount / summary.request_count) * 100)
    : 0;

  return (
    <main style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 20px 80px" }}>
      <section style={{ marginBottom: 32 }}>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            opacity: 0.7,
          }}
        >
          Network Snapshot
        </p>
        <h1 style={{ margin: "10px 0 8px", fontSize: "clamp(2rem, 4vw, 3.4rem)", lineHeight: 1.05 }}>
          Network-wide staffing health.
        </h1>
        <p style={{ margin: 0, maxWidth: 720, opacity: 0.78, lineHeight: 1.55 }}>
          Aggregate visibility across every APF-affiliated organization. Read-only metrics for
          oversight, accountability, and pattern detection — not for day-to-day dispatch.
        </p>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 32,
        }}
      >
        <MetricCard label="Affiliated organizations" value={summary.organization_count} />
        <MetricCard label="Total requests" value={summary.request_count} />
        <MetricCard label="Open requests" value={openCount} />
        <MetricCard label="Fill rate" value={`${fillRate}%`} accent="#a4c8a3" />
      </section>

      <section
        style={{
          padding: 28,
          borderRadius: 22,
          background: "rgba(247, 240, 223, 0.06)",
          border: "1px solid rgba(247, 240, 223, 0.1)",
        }}
      >
        <h2 style={{ margin: "0 0 16px", fontSize: 22 }}>Organization activity</h2>
        <div style={{ display: "grid", gap: 12 }}>
          {organizations.map((organization) => {
            const orgRequests = requests.filter(
              (request) => request.organization_id === organization.id,
            );
            return (
              <div
                key={organization.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.5fr 1fr 1fr",
                  gap: 12,
                  padding: "14px 18px",
                  borderRadius: 14,
                  background: "rgba(247, 240, 223, 0.04)",
                }}
              >
                <div>
                  <strong>{organization.name}</strong>
                  <div style={{ marginTop: 4, fontSize: 13, opacity: 0.7 }}>
                    {organization.city}
                    {organization.region ? `, ${organization.region}` : ""} ·{" "}
                    {organization.type.replace(/_/g, " ")}
                  </div>
                </div>
                <div style={{ alignSelf: "center" }}>
                  <span style={{ opacity: 0.7, fontSize: 13 }}>Requests</span>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{orgRequests.length}</div>
                </div>
                <div style={{ alignSelf: "center" }}>
                  <span style={{ opacity: 0.7, fontSize: 13 }}>Status</span>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: organization.is_active ? "#a4c8a3" : "#d6a08c",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {organization.is_active ? "active" : "inactive"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <p style={{ marginTop: 32, opacity: 0.55, fontSize: 13 }}>
        APF oversight surface · read-only · richer reporting (fill time, language coverage, regional
        gaps) coming next.
      </p>
    </main>
  );
}

function MetricCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div
      style={{
        padding: 20,
        borderRadius: 18,
        background: "rgba(247, 240, 223, 0.06)",
        border: "1px solid rgba(247, 240, 223, 0.12)",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 12,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          opacity: 0.7,
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: "10px 0 0",
          fontSize: 38,
          fontWeight: 700,
          color: accent || "#f3ead4",
          lineHeight: 1,
        }}
      >
        {value}
      </p>
    </div>
  );
}
