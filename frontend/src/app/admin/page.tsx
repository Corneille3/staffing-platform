import Link from "next/link";
import { PageFrame } from "../../components/page-frame";
import { Panel } from "../../components/panel";
import { StatCard } from "../../components/stat-card";
import { getDashboardData } from "../../lib/api";

function formatStatus(value: string) {
  return value.replace(/_/g, " ");
}

export default async function AdminDashboardPage() {
  const { summary, organizations, workers, requests } = await getDashboardData();

  return (
    <PageFrame
      eyebrow="APF Network Pilot"
      title="Staffing operations in one view."
      description="Local substitute dispatch is running end to end: requests, worker responses, assignments, and reporting are all coming from the live FastAPI backend."
    >
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 18,
          marginTop: 24,
        }}
      >
        <StatCard label="Organizations" value={summary.organization_count} tone="#173328" />
        <StatCard label="Requests" value={summary.request_count} tone="#35594a" />
        <StatCard label="Assignments" value={summary.assignment_count} tone="#85714d" />
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1.15fr 0.85fr",
          gap: 22,
          marginTop: 26,
        }}
      >
        <Panel title="Active staffing requests" subtitle={`${requests.length} total`}>
          <div style={{ display: "grid", gap: 16, marginTop: 20 }}>
            {requests.map((request) => (
              <Link
                key={request.id}
                href={`/admin/requests/${request.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <article
                  style={{
                    borderRadius: 22,
                    padding: 18,
                    background: "#fffdf7",
                    border: "1px solid rgba(24, 50, 41, 0.1)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <h3 style={{ margin: 0, fontSize: 22 }}>{request.title}</h3>
                    <span
                      style={{
                        borderRadius: 999,
                        padding: "6px 12px",
                        background: request.status === "assigned" ? "#d2ead8" : "#efe3b9",
                        color: "#183229",
                        fontSize: 12,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {formatStatus(request.status)}
                    </span>
                  </div>
                  <p style={{ margin: "10px 0 0", color: "#395147", lineHeight: 1.5 }}>
                    {request.description || "No additional notes yet."}
                  </p>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                      gap: 10,
                      marginTop: 16,
                      color: "#274339",
                      fontSize: 14,
                    }}
                  >
                    <span>{request.city}</span>
                    <span>{request.work_date}</span>
                    <span>
                      {request.start_time.slice(0, 5)} - {request.end_time.slice(0, 5)}
                    </span>
                    <span>Urgency {request.urgency_level}</span>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        </Panel>

        <div style={{ display: "grid", gap: 22 }}>
          <Panel title="Organizations">
            <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
              {organizations.map((organization) => (
                <div
                  key={organization.id}
                  style={{
                    borderLeft: "4px solid #24463b",
                    paddingLeft: 14,
                  }}
                >
                  <p style={{ margin: 0, fontSize: 20 }}>{organization.name}</p>
                  <p style={{ margin: "6px 0 0", color: "#4a5f58" }}>
                    {organization.city}
                    {organization.region ? `, ${organization.region}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Workers">
            <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
              {workers.map((worker) => (
                <div
                  key={worker.id}
                  style={{
                    display: "grid",
                    gap: 6,
                    borderRadius: 18,
                    padding: 16,
                    background: "#fffdf7",
                    border: "1px solid rgba(24, 50, 41, 0.1)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                    <strong style={{ fontSize: 18 }}>
                      {worker.first_name} {worker.last_name}
                    </strong>
                    <span
                      style={{
                        color:
                          worker.profile?.availability_status === "available" ? "#296246" : "#8c4d3f",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        fontSize: 12,
                        letterSpacing: "0.08em",
                      }}
                    >
                      {worker.profile?.availability_status || "unknown"}
                    </span>
                  </div>
                  <span style={{ color: "#496158" }}>{worker.email}</span>
                  <span style={{ color: "#6b786f", fontSize: 14 }}>
                    Cities: {worker.profile?.supported_cities.join(", ") || "none"}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </section>
    </PageFrame>
  );
}
