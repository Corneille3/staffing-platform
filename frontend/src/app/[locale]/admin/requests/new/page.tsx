import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AdminRequestNewForm } from "../../../../../components/admin-request-new-form";
import { Eyebrow, Mono } from "../../../../../components/ui";
import { getOrganizations } from "../../../../../lib/api";

export default async function NewRequestPage() {
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
          Back to requests
        </Link>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 22 }}>
        <div>
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
            New staffing <em style={{ fontStyle: "italic" }}>request</em>
          </h1>
          <p style={{ margin: "10px 0 0", maxWidth: 660, color: "var(--ink-2)", fontSize: 14, lineHeight: 1.55 }}>
            Three steps. The draft autosaves while you type. We only notify substitutes who match the
            language, qualifications, city, and weekly availability you choose.
          </p>
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--mono)" }}>
          <Mono>REQ · draft</Mono>
        </div>
      </div>

      <AdminRequestNewForm organizations={organizations} />
    </>
  );
}
