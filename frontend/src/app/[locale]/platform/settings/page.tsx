import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { PlatformSettingsView } from "../../../../components/platform-settings-view";
import {
  getPlatformAccessGrants,
  getPlatformOperators,
  getPlatformSettings,
  requireServerSession,
} from "../../../../lib/api";

const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default async function PlatformSettingsPage() {
  // Self-removal is blocked backend-side too; the email just hides the button.
  let viewerEmail: string | null = null;
  if (CLERK_ENABLED) {
    const session = await requireServerSession(["platform_admin"]);
    if (session.platform_operator_role === "marketing") redirect(`/${await getLocale()}/platform/leads`);
    viewerEmail = session.email;
  }
  const [operators, settings, grants] = await Promise.all([
    getPlatformOperators(), // null when the viewer is `support` (403)
    getPlatformSettings(),
    getPlatformAccessGrants(),
  ]);
  return (
    <PlatformSettingsView
      operators={operators}
      settings={settings}
      grants={grants}
      viewerEmail={viewerEmail}
    />
  );
}
