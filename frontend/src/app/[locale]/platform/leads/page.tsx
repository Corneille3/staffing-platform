import { redirect } from "next/navigation";
import { PlatformLeadsView } from "../../../../components/platform-leads-view";
import { getPlatformLeadStats, getPlatformLeads, requireServerSession } from "../../../../lib/api";
import { parseLeadFilters } from "../../../../lib/leads";
import { shiftDateKey } from "../../../../lib/shift-time";

const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default async function PlatformLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The pipeline belongs to owner + marketing; operator and support would
  // only get 403s from the API — send them back to their console.
  if (CLERK_ENABLED) {
    const session = await requireServerSession(["platform_admin"]);
    const role = session.platform_operator_role;
    if (role !== "owner" && role !== "marketing") redirect("/platform/tenants");
  }

  const filters = parseLeadFilters(await searchParams);
  const [data, stats] = await Promise.all([getPlatformLeads(filters), getPlatformLeadStats()]);

  return <PlatformLeadsView data={data} stats={stats} filters={filters} todayKey={shiftDateKey()} />;
}
