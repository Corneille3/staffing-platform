import { PageFrame } from "../../../components/page-frame";
import { Panel } from "../../../components/panel";
import { getWorkers } from "../../../lib/api";
import { WorkerAvailabilityControl } from "../../../components/worker-availability-control";

export default async function WorkersPage() {
  const workers = await getWorkers();

  return (
    <PageFrame
      eyebrow="Worker Roster"
      title="Workers"
      description="This view shows who is active, where they can travel, and whether they are currently available for substitute dispatch."
    >
      <Panel title="Worker availability" subtitle={`${workers.length} workers`}>
        <div style={{ display: "grid", gap: 16 }}>
          {workers.map((worker) => (
            <article
              key={worker.id}
              style={{
                borderRadius: 22,
                padding: 20,
                background: "#fffdf7",
                border: "1px solid rgba(24, 50, 41, 0.1)",
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 24 }}>
                    {worker.first_name} {worker.last_name}
                  </h2>
                  <p style={{ margin: "6px 0 0", color: "#496158" }}>{worker.email}</p>
                </div>
                <WorkerAvailabilityControl workerId={worker.id} currentStatus={worker.profile?.availability_status || "unknown"} />
              </div>
              <div style={{ color: "#3d564c", display: "grid", gap: 6 }}>
                <span>Language: {worker.preferred_language}</span>
                <span>Cities: {worker.profile?.supported_cities.join(", ") || "none"}</span>
                <span>Qualifications: {worker.profile?.qualifications.join(", ") || "none"}</span>
                <span>Certifications: {worker.profile?.certifications.join(", ") || "none"}</span>
              </div>
            </article>
          ))}
        </div>
      </Panel>
    </PageFrame>
  );
}
