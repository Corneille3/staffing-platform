import { getTranslations } from "next-intl/server";
import { Eyebrow } from "../../../../components/ui";
import { HideOnReadOnlyVisit, ReadOnlyVisitNotice } from "../../../../components/read-only-visit";
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
  const t = await getTranslations("apf.export");

  return (
    <>
      <section style={{ marginBottom: 32 }}>
        <Eyebrow style={{ marginBottom: 12 }}>{t("eyebrow")}</Eyebrow>
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
          {t.rich("title", { em: (chunks) => <em style={{ fontStyle: "italic" }}>{chunks}</em> })}
        </h1>
        <p style={{ margin: "12px 0 0", maxWidth: 720, color: "var(--ink-2)", lineHeight: 1.55, fontSize: 15 }}>
          {t("body")}
        </p>
      </section>

      <HideOnReadOnlyVisit fallback={<ReadOnlyVisitNotice />}>
        <ApfExportForm orgs={orgs} initialOrgId={initialOrgId} />
      </HideOnReadOnlyVisit>
    </>
  );
}
