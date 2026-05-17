import Link from "next/link";
import { PageFrame } from "../../../components/page-frame";
import { Panel } from "../../../components/panel";
import { StatCard } from "../../../components/stat-card";
import { Mono } from "../../../components/ui";
import { getDashboardData } from "../../../lib/api";

function formatStatus(value: string) {
  return value.replace(/_/g, " ");
}

export default async function AdminDashboardPage() {
  const { summary, organizations, workers, requests } = await getDashboardData();

  return (
    <PageFrame
      eyebrow="Staffig Network"
      title="Coverage operations in one view."
      description="Local substitute dispatch running end to end — coverage requests, substitute responses, assignments, and reporting all from the live backend."
    >
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
          marginBottom: 22,
        }}
      >
        <StatCard label="Organizations" value={summary.organization_count} />
        <StatCard label="Requests" value={summary.request_count} />
        <StatCard label="Assignments" value={summary.assignment_count} />
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1.15fr 0.85fr",
          gap: 22,
        }}
      >
        <Panel title="Active coverage requests" subtitle={`${requests.length} total`}>
          <div style={{ display: "grid", gap: 12 }}>
            {requests.map((request) => (
              <Link
                key={request.id}
                href={`/admin/requests/${request.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <article
                  style={{
                    borderRadius: 14,
                    padding: 16,
                    background: "var(--paper-2)",
                    border: "0.5px solid var(--line)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                    <h3 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 18, lineHeight: 1.15, fontWeight: 400 }}>
                      {request.title}
                    </h3>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        borderRadius: 999,
                        padding: "4px 10px",
                        background: request.status === "assigned" ? "var(--moss-soft)" : "var(--sand-soft)",
                        color: request.status === "assigned" ? "var(--moss)" : "#8C6B14",
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: "0.03em",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatStatus(request.status)}
                    </span>
                  </div>
                  <p style={{ margin: "8px 0 0", color: "var(--ink-2)", fontSize: 13, lineHeight: 1.5 }}>
                    {request.description || "No additional notes yet."}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 12,
                      marginTop: 12,
                      color: "var(--ink-3)",
                      fontSize: 12,
                    }}
                  >
                    <span>{request.city}</span>
                    <span>·</span>
                    <span>{request.work_date}</span>
                    <span>·</span>
                    <Mono style={{ fontSize: 12 }}>{request.start_time.slice(0, 5)}–{request.end_time.slice(0, 5)}</Mono>
                    <span>·</span>
                    <span>Urgency {request.urgency_level}</span>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        </Panel>

        <div style={{ display: "grid", gap: 22 }}>
          <Panel title="Organizations">
            <div style={{ display: "grid", gap: 12 }}>
              {organizations.map((organization) => (
                <div
                  key={organization.id}
                  style={{
                    borderLeft: "2px solid var(--terra)",
                    paddingLeft: 12,
                  }}
                >
                  <p style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 16, fontWeight: 400 }}>{organization.name}</p>
                  <p style={{ margin: "4px 0 0", color: "var(--ink-3)", fontSize: 12 }}>
                    {organization.city}
                    {organization.region ? `, ${organization.region}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Substitutes">
            <div style={{ display: "grid", gap: 10 }}>
              {workers.map((worker) => (
                <div
                  key={worker.id}
                  style={{
                    display: "grid",
                    gap: 4,
                    borderRadius: 12,
                    padding: 12,
                    background: "var(--paper-2)",
                    border: "0.5px solid var(--line)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <strong style={{ fontSize: 14, fontWeight: 600 }}>
                      {worker.first_name} {worker.last_name}
                    </strong>
                    <span
                      style={{
                        color:
                          worker.profile?.availability_status === "available" ? "var(--moss)" : "var(--ink-3)",
                        fontWeight: 600,
                        fontSize: 11,
                        letterSpacing: "0.04em",
                      }}
                    >
                      {worker.profile?.availability_status || "unknown"}
                    </span>
                  </div>
                  <span style={{ color: "var(--ink-3)", fontSize: 12 }}>{worker.email}</span>
                  <span style={{ color: "var(--ink-3)", fontSize: 12 }}>
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
