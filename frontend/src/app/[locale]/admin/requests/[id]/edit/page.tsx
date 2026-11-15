import { getLocale } from "next-intl/server";
import { Link } from "../../../../../../i18n/navigation";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminRequestEditForm } from "../../../../../../components/admin-request-edit-form";
import { HideOnReadOnlyVisit, ReadOnlyVisitNotice } from "../../../../../../components/read-only-visit";
import { Eyebrow } from "../../../../../../components/ui";
import { getOrganizations, getRequest, getRequestResponses } from "../../../../../../lib/api";

// Mirrors StaffingRequestService.EDITABLE_STATUSES — only pre-assigned requests
// can be edited. Anything assigned/closed bounces back to the read-only detail.
const EDITABLE_STATUSES = new Set(["draft", "open", "notified", "responses_received"]);

export default async function EditRequestPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = await params;

  let request;
  try {
    request = await getRequest(id);
  } catch {
    notFound();
  }

  if (!EDITABLE_STATUSES.has(request.status)) {
    redirect(`/${await getLocale()}/admin/requests/${id}`);
  }

  const organizations = await getOrganizations();
  const orgName =
    organizations.find((o) => o.id === request.organization_id)?.name ??
    request.organization?.name ??
    "Organization";
  // The warning under the form points at Re-notify, which hides once someone
  // accepted — fetch responses so the copy can tell the truth in both cases.
  const responses = await getRequestResponses(id).catch(() => []);
  const hasAccepted = responses.some((r) => r.status === "accepted");

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <Link
          href={`/admin/requests/${id}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--ink-2)",
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          <ArrowLeft size={14} />
          Back to request
        </Link>
      </div>

      <div style={{ marginBottom: 22 }}>
        <Eyebrow style={{ marginBottom: 6 }}>Coverage Desk</Eyebrow>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--serif)",
            fontSize: "clamp(2rem, 4vw, 3rem)",
            lineHeight: 1.05,
            fontWeight: 400,
            color: "var(--ink)",
          }}
        >
          Edit <em style={{ fontStyle: "italic" }}>request</em>
        </h1>
        <p style={{ margin: "10px 0 0", maxWidth: 660, color: "var(--ink-2)", fontSize: 14, lineHeight: 1.55 }}>
          Fix shift details before a substitute is assigned. Changes save in one click.
        </p>
      </div>

      <HideOnReadOnlyVisit fallback={<ReadOnlyVisitNotice />}>
        <AdminRequestEditForm request={request} orgName={orgName} hasAccepted={hasAccepted} />
      </HideOnReadOnlyVisit>
    </>
  );
}
