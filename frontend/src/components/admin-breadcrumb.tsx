"use client";

import { usePathname } from "next/navigation";
import { Eyebrow } from "./ui";

const CRUMBS: { match: (p: string) => boolean; label: string }[] = [
  { match: (p) => p === "/admin", label: "Coverage Desk" },
  { match: (p) => p.startsWith("/admin/requests/new"), label: "New request" },
  { match: (p) => p.startsWith("/admin/requests"), label: "Requests" },
  { match: (p) => p.startsWith("/admin/substitutes"), label: "Substitutes" },
  { match: (p) => p.startsWith("/admin/organizations"), label: "Organizations" },
  { match: (p) => p.startsWith("/admin/activity"), label: "Activity" },
];

export function AdminBreadcrumb() {
  const pathname = usePathname();
  const stripped = pathname.replace(/^\/(?:en|fr)(?=\/|$)/, "") || "/";
  const crumb = CRUMBS.find((c) => c.match(stripped))?.label ?? "Operations Console";
  return <Eyebrow>{crumb}</Eyebrow>;
}
