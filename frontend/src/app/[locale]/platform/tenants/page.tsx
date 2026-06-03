import { PlatformTenantsView } from "../../../../components/platform-tenants-view";
import { getPlatformTenants } from "../../../../lib/api";

export default async function PlatformTenantsPage() {
  const data = await getPlatformTenants();
  return <PlatformTenantsView data={data} />;
}
