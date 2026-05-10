import Link from "next/link";
import { getNetworks, requireServerSession } from "../../../lib/api";

const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const LANG_LABEL: Record<string, string> = { fr: "FR", en: "EN", bilingual: "Bilingual" };

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

export default async function NetworksPage() {
  if (CLERK_ENABLED) {
    await requireServerSession(["platform_admin"]);
  }
  const networks = await getNetworks();

  return (
    <main style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 20px 80px" }}>
      <section style={{ marginBottom: 36 }}>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            opacity: 0.6,
          }}
        >
          Platform Management
        </p>
        <h1 style={{ margin: "10px 0 8px", fontSize: "clamp(2rem, 4vw, 3.4rem)", lineHeight: 1.05 }}>
          Networks
        </h1>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <p style={{ margin: 0, maxWidth: 640, opacity: 0.72, lineHeight: 1.55 }}>
            Each business that runs Staffig is a tenant network with its own isolated data
            and its own network admin. Add a network here; the new admin signs in with the
            invited email and runs their tenant from there.
          </p>
          <Link
            href="/apf/networks/new"
            style={{
              display: "inline-block",
              padding: "10px 20px",
              borderRadius: 12,
              background: "#f7f0df",
              color: "#183229",
              fontSize: 14,
              fontWeight: 800,
              textDecoration: "none",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            + Add network
          </Link>
        </div>
      </section>

      <div
        style={{
          padding: 24,
          borderRadius: 22,
          background: "rgba(247,240,223,0.06)",
          border: "1px solid rgba(247,240,223,0.1)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 20,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18 }}>All networks</h2>
          <span style={{ fontSize: 13, opacity: 0.55 }}>{networks.length} records</span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.6fr 0.8fr 2fr 0.8fr 0.8fr",
            gap: 12,
            padding: "8px 14px",
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            opacity: 0.5,
          }}
        >
          <span>Name</span>
          <span>Slug</span>
          <span>Network admin</span>
          <span>Created</span>
          <span>Status</span>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          {networks.map((network) => (
            <div
              key={network.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1.6fr 0.8fr 2fr 0.8fr 0.8fr",
                gap: 12,
                padding: "14px",
                borderRadius: 14,
                alignItems: "center",
                background: "rgba(247,240,223,0.03)",
                border: "1px solid rgba(247,240,223,0.06)",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>{network.name}</div>
              <code style={{ fontSize: 12, opacity: 0.7 }}>{network.slug}</code>
              <div>
                {network.network_admin ? (
                  <>
                    <div style={{ fontSize: 13 }}>
                      {network.network_admin.first_name} {network.network_admin.last_name}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.55, marginTop: 2 }}>
                      {network.network_admin.email}
                      {network.network_admin.clerk_user_id ? null : (
                        <span style={{ marginLeft: 8, opacity: 0.6, fontStyle: "italic" }}>
                          · awaiting first sign-in
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <span style={{ fontSize: 12, opacity: 0.4 }}>No active admin</span>
                )}
                {network.network_admin ? (
                  <span
                    style={{
                      display: "inline-block",
                      marginTop: 4,
                      padding: "2px 7px",
                      borderRadius: 999,
                      background: "rgba(247,240,223,0.1)",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    {LANG_LABEL[network.network_admin.preferred_language] ??
                      network.network_admin.preferred_language.toUpperCase()}
                  </span>
                ) : null}
              </div>
              <div style={{ fontSize: 12, opacity: 0.6 }}>{formatDate(network.created_at)}</div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  padding: "3px 10px",
                  borderRadius: 999,
                  width: "fit-content",
                  background: network.is_active
                    ? "rgba(164,200,163,0.15)"
                    : "rgba(214,160,140,0.15)",
                  color: network.is_active ? "#a4c8a3" : "#d6a08c",
                }}
              >
                {network.is_active ? "Active" : "Inactive"}
              </span>
            </div>
          ))}

          {networks.length === 0 && (
            <p style={{ margin: "12px 0 0", opacity: 0.5 }}>
              No networks yet. Add the first one.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
