import { PlatformTenantsView } from "../../../../components/platform-tenants-view";
import { getPlatformTenants, getTenantProfile } from "../../../../lib/api";

export default async function PlatformTenantsPage() {
  // callerWorkspace: the tenant this operator can already open (own
  // membership or active §2.2 grant) — its row shows "Open workspace"
  // instead of "Request access". null = no workspace (404).
  const [data, callerWorkspace] = await Promise.all([
    getPlatformTenants(),
    getTenantProfile().catch(() => null),
  ]);
  return <PlatformTenantsView data={data} callerWorkspace={callerWorkspace} />;
}
