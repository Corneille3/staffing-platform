import { Eyebrow } from "../../../../components/ui";
import { ApfExportForm } from "../../../../components/apf-export-form";
import { getOrganizations } from "../../../../lib/api";

function singleString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ApfExportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const initialOrgId = singleString(params.org_id);
  const orgs = await getOrganizations();

  return (
    <>
      <section style={{ marginBottom: 32 }}>
        <Eyebrow style={{ marginBottom: 12 }}>Compliance & Reporting</Eyebrow>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--serif)",
            fontSize: "clamp(2rem, 4vw, 3.2rem)",
            lineHeight: 1.05,
            fontWeight: 400,
            color: "var(--ink)",
          }}
        >
          Export <em style={{ fontStyle: "italic" }}>activity</em>
        </h1>
        <p style={{ margin: "12px 0 0", maxWidth: 720, color: "var(--ink-2)", lineHeight: 1.55, fontSize: 15 }}>
          Pick a date range and (optionally) limit to specific organizations. We&apos;ll generate a CSV
          of every staffing request that falls in the window, along with its assignment outcome and time-to-fill.
          The link is downloadable here and is also emailed to you.
        </p>
      </section>

      <ApfExportForm orgs={orgs} initialOrgId={initialOrgId} />
    </>
  );
}
