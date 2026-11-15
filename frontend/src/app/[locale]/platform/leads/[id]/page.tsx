import { getLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { PlatformLeadDetail } from "../../../../../components/platform-lead-detail";
import { getPlatformLead, requireServerSession } from "../../../../../lib/api";
import { shiftDateKey } from "../../../../../lib/shift-time";

const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default async function PlatformLeadPage({ params }: { params: Promise<{ id: string }> }) {
  let isOwner = true; // dev mode: no roles
  if (CLERK_ENABLED) {
    const session = await requireServerSession(["platform_admin"]);
    const role = session.platform_operator_role;
    if (role !== "owner" && role !== "marketing") redirect(`/${await getLocale()}/platform/tenants`);
    isOwner = role === "owner";
  }

  const { id } = await params;
  const lead = await getPlatformLead(id);
  if (!lead) notFound();

  return <PlatformLeadDetail initial={lead} todayKey={shiftDateKey()} isOwner={isOwner} />;
}
