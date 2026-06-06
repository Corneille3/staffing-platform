import { PlatformTenantsView } from "../../../../components/platform-tenants-view";
import { getPlatformTenants, getTenantProfile, requireServerSession } from "../../../../lib/api";

const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default async function PlatformTenantsPage() {
  // callerWorkspace: the tenant this operator can already open (own
  // membership or active §2.2 grant) — its row shows "Open workspace"
  // instead of "Request access". null = no workspace (404).
  const [data, callerWorkspace] = await Promise.all([
    getPlatformTenants(),
    getTenantProfile().catch(() => null),
  ]);
  // `support` gets a read-only tenants table: lifecycle controls hidden
  // (the backend 403s them anyway — PLATFORM_HANDOFF §1 capability table).
  const session = CLERK_ENABLED ? await requireServerSession(["platform_admin"]) : null;
  return (
    <PlatformTenantsView
      data={data}
      callerWorkspace={callerWorkspace}
      callerOperatorRole={session?.platform_operator_role ?? null}
    />
  );
}
