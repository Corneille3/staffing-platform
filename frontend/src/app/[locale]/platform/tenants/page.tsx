import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { PlatformTenantsView } from "../../../../components/platform-tenants-view";
import { getPlatformTenants, getTenantProfile, requireServerSession } from "../../../../lib/api";

const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PlatformTenantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // `support` gets a read-only tenants table: lifecycle controls hidden
  // (the backend 403s them anyway — PLATFORM_HANDOFF §1 capability table).
  // `marketing` has no business here at all — back to the pipeline.
  const session = CLERK_ENABLED ? await requireServerSession(["platform_admin"]) : null;
  const role = session?.platform_operator_role ?? null;
  if (role === "marketing") redirect(`/${await getLocale()}/platform/leads`);

  // callerWorkspace: the tenant this operator can already open (own
  // membership or active §2.2 grant) — its row shows "Open workspace"
  // instead of "Request access". null = no workspace (404).
  const [data, callerWorkspace] = await Promise.all([
    getPlatformTenants(),
    getTenantProfile().catch(() => null),
  ]);
  // ?tenant=<id>: arriving from a lead page — show that workspace's row only.
  const raw = (await searchParams).tenant;
  const focus = typeof raw === "string" && UUID.test(raw) ? raw : null;

  return (
    <PlatformTenantsView
      data={data}
      focusTenantId={focus}
      callerWorkspace={callerWorkspace}
      callerOperatorRole={role}
    />
  );
}
