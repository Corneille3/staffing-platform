import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { PlatformOverviewView } from "../../../../components/platform-overview-view";
import { getPlatformOverview, requireServerSession } from "../../../../lib/api";

const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default async function PlatformOverviewPage() {
  // `marketing` owns the sales pipeline and nothing else: the API would
  // answer 403 here.
  const session = CLERK_ENABLED ? await requireServerSession(["platform_admin"]) : null;
  if (session?.platform_operator_role === "marketing") redirect(`/${await getLocale()}/platform/leads`);

  return <PlatformOverviewView data={await getPlatformOverview()} />;
}
