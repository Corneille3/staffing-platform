import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireServerSession } from "../../../lib/api";

const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default async function PlatformIndex() {
  // A marketing operator owns the sales pipeline and nothing else: the
  // rest of the console would only answer 403. Everyone else lands on the
  // overview — what needs attention today.
  if (CLERK_ENABLED) {
    const session = await requireServerSession(["platform_admin"]);
    if (session.platform_operator_role === "marketing") redirect(`/${await getLocale()}/platform/leads`);
  }
  redirect(`/${await getLocale()}/platform/overview`);
}
