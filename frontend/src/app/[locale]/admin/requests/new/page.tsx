import { getTranslations } from "next-intl/server";
import { Link } from "../../../../../i18n/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminRequestNewForm } from "../../../../../components/admin-request-new-form";
import { HideOnReadOnlyVisit, ReadOnlyVisitNotice } from "../../../../../components/read-only-visit";
import { Eyebrow, Mono } from "../../../../../components/ui";
import { getOrganizations } from "../../../../../lib/api";

export default async function NewRequestPage() {
  const t = await getTranslations("admin");
  const organizations = await getOrganizations();

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <Link
          href="/admin/requests"
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
          {t("form.backToRequests")}
        </Link>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 22 }}>
        <div>
          <Eyebrow style={{ marginBottom: 6 }}>{t("nav.desk")}</Eyebrow>
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
            {t("form.newTitleLead")} <em style={{ fontStyle: "italic" }}>{t("form.newTitleEm")}</em>
          </h1>
          <p style={{ margin: "10px 0 0", maxWidth: 660, color: "var(--ink-2)", fontSize: 14, lineHeight: 1.55 }}>
            {t("form.newDescription")}
          </p>
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--mono)" }}>
          <Mono>{t("form.reqDraft")}</Mono>
        </div>
      </div>

      <HideOnReadOnlyVisit fallback={<ReadOnlyVisitNotice />}>
        <AdminRequestNewForm organizations={organizations} />
      </HideOnReadOnlyVisit>
    </>
  );
}
