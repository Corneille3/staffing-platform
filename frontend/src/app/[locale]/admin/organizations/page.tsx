import { getTranslations } from "next-intl/server";
import { PageFrame } from "../../../../components/page-frame";
import { OrganizationsView } from "../../../../components/organizations-view";
import { getAdminOrganizations } from "../../../../lib/api";

export default async function OrganizationsPage() {
  const t = await getTranslations("admin");
  const sites = await getAdminOrganizations();

  return (
    <PageFrame
      eyebrow={t("organizations.eyebrow")}
      title={t("nav.organizations")}
      description={t("organizations.description")}
    >
      <OrganizationsView sites={sites} />
    </PageFrame>
  );
}
