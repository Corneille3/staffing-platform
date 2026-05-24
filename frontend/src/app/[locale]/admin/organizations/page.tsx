import { PageFrame } from "../../../../components/page-frame";
import { OrganizationsView } from "../../../../components/organizations-view";
import { getAdminOrganizations } from "../../../../lib/api";

export default async function OrganizationsPage() {
  const sites = await getAdminOrganizations();

  return (
    <PageFrame
      eyebrow="Your sites"
      title="Organizations"
      description="The physical reality of the sites you run — enrollment, coordinators, hours, and fill rate per location."
    >
      <OrganizationsView sites={sites} />
    </PageFrame>
  );
}
