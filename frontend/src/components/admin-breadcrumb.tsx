"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Eyebrow } from "./ui";

const CRUMBS: { match: (p: string) => boolean; label: string }[] = [
  // label = key under admin.nav
  { match: (p) => p === "/admin", label: "desk" },
  { match: (p) => p.startsWith("/admin/requests/new"), label: "newRequest" },
  { match: (p) => p.startsWith("/admin/requests"), label: "requests" },
  { match: (p) => p.startsWith("/admin/substitutes"), label: "substitutes" },
  { match: (p) => p.startsWith("/admin/replacements"), label: "replacements" },
  { match: (p) => p.startsWith("/admin/organizations"), label: "organizations" },
  { match: (p) => p.startsWith("/admin/activity"), label: "activity" },
];

export function AdminBreadcrumb() {
  const pathname = usePathname();
  const stripped = pathname.replace(/^\/(?:en|fr)(?=\/|$)/, "") || "/";
  const t = useTranslations("admin");
  const key = CRUMBS.find((c) => c.match(stripped))?.label;
  return <Eyebrow>{key ? t(`nav.${key}`) : t("shell.console")}</Eyebrow>;
}
