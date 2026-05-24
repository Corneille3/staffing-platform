import Link from "next/link";
import { Eyebrow, Mono } from "../../../../components/ui";
import { getNetworks, requireServerSession } from "../../../../lib/api";
import { OrphanUserCleanup } from "../../../../components/orphan-user-cleanup";
import { RemoveNetworkButton } from "../../../../components/remove-network-button";

const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const LANG_LABEL: Record<string, string> = { fr: "FR", en: "EN", bilingual: "Bilingual" };

const CARD_STYLE: React.CSSProperties = {
  background: "var(--card)",
  border: "0.5px solid var(--line)",
};

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
  let actorUserId: string | null = null;
  if (CLERK_ENABLED) {
    const session = await requireServerSession(["platform_admin"]);
    actorUserId = session.id;
  }
  const networks = await getNetworks();

  return (
    <>
      <section style={{ marginBottom: 32 }}>
        <Eyebrow style={{ marginBottom: 12 }}>Platform Management</Eyebrow>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--serif)",
            fontSize: "clamp(2rem, 4vw, 3.2rem)",
            lineHeight: 1.05,
            fontWeight: 400,
            color: "var(--ink)",
          }}
        >
          <em style={{ fontStyle: "italic" }}>Networks</em>
        </h1>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 20,
            flexWrap: "wrap",
            marginTop: 12,
          }}
        >
          <p style={{ margin: 0, maxWidth: 640, color: "var(--ink-2)", lineHeight: 1.55, fontSize: 15 }}>
            Each business that runs Staffig is a tenant network with its own isolated data
            and its own network admin. Add a network here; the new admin signs in with the
            invited email and runs their tenant from there.
          </p>
          <Link
            href="/apf/networks/new"
            style={{
              display: "inline-block",
              padding: "10px 18px",
              borderRadius: 999,
              background: "var(--terra)",
              color: "var(--paper)",
              fontSize: 14,
              fontWeight: 500,
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
          ...CARD_STYLE,
          padding: 24,
          borderRadius: "var(--r-lg)",
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
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500, color: "var(--ink)" }}>
            All networks
          </h2>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            <Mono>{networks.length}</Mono> records
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.6fr 0.8fr 2fr 0.8fr 0.8fr 0.7fr",
            gap: 12,
            padding: "8px 14px",
            fontSize: 10,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            fontWeight: 500,
            borderBottom: "0.5px solid var(--line)",
          }}
        >
          <span>Name</span>
          <span>Slug</span>
          <span>Network admin</span>
          <span>Created</span>
          <span>Status</span>
          <span></span>
        </div>

        <div style={{ display: "grid" }}>
          {networks.map((network) => (
            <div
              key={network.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1.6fr 0.8fr 2fr 0.8fr 0.8fr 0.7fr",
                gap: 12,
                padding: "14px",
                alignItems: "center",
                borderBottom: "0.5px solid var(--line-soft)",
              }}
            >
              <div style={{ fontWeight: 500, fontSize: 14, color: "var(--ink)" }}>{network.name}</div>
              <code style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--mono)" }}>
                {network.slug}
              </code>
              <div>
                {network.network_admin ? (
                  <>
                    <div style={{ fontSize: 13, color: "var(--ink)" }}>
                      {network.network_admin.first_name} {network.network_admin.last_name}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                      {network.network_admin.email}
                      {network.network_admin.clerk_user_id ? null : (
                        <span style={{ marginLeft: 8, color: "var(--ink-3)", fontStyle: "italic" }}>
                          · awaiting first sign-in
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>No active admin</span>
                )}
                {network.network_admin ? (
                  <span
                    style={{
                      display: "inline-block",
                      marginTop: 4,
                      padding: "2px 7px",
                      borderRadius: 999,
                      background: "var(--paper)",
                      fontSize: 11,
                      fontWeight: 500,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--ink)",
                      border: "0.5px solid var(--line)",
                    }}
                  >
                    {LANG_LABEL[network.network_admin.preferred_language] ??
                      network.network_admin.preferred_language.toUpperCase()}
                  </span>
                ) : null}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                <Mono>{formatDate(network.created_at)}</Mono>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  padding: "3px 10px",
                  borderRadius: 999,
                  width: "fit-content",
                  background: "var(--paper)",
                  color: network.is_active ? "var(--moss)" : "var(--rose)",
                  border: `0.5px solid ${network.is_active ? "var(--moss)" : "var(--rose)"}`,
                }}
              >
                {network.is_active ? "Active" : "Inactive"}
              </span>

              <div style={{ justifySelf: "end" }}>
                <RemoveNetworkButton
                  tenantId={network.id}
                  tenantName={network.name}
                  isActive={network.is_active}
                  isOwnTenant={
                    actorUserId !== null && network.network_admin?.id === actorUserId
                  }
                />
              </div>
            </div>
          ))}

          {networks.length === 0 && (
            <p style={{ margin: "12px 0 0", color: "var(--ink-3)" }}>
              No networks yet. Add the first one.
            </p>
          )}
        </div>
      </div>

      <OrphanUserCleanup />
    </>
  );
}
