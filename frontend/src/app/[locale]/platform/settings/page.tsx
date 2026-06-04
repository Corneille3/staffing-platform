import { PlatformSettingsView } from "../../../../components/platform-settings-view";
import { getPlatformOperators, getPlatformSettings, requireServerSession } from "../../../../lib/api";

const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default async function PlatformSettingsPage() {
  const [operators, settings] = await Promise.all([
    getPlatformOperators(), // null when the viewer is `support` (403)
    getPlatformSettings(),
  ]);
  // Self-removal is blocked backend-side too; the email just hides the button.
  let viewerEmail: string | null = null;
  if (CLERK_ENABLED) {
    const session = await requireServerSession(["platform_admin"]);
    viewerEmail = session.email;
  }
  return <PlatformSettingsView operators={operators} settings={settings} viewerEmail={viewerEmail} />;
}
