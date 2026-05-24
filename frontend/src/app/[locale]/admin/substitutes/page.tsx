import Link from "next/link";
import { Sparkles } from "lucide-react";
import { PageFrame } from "../../../../components/page-frame";
import { AdminSubstitutesTable } from "../../../../components/admin-substitutes-table";
import { Mono } from "../../../../components/ui";
import { getAdminSubstitutes } from "../../../../lib/api";

const LANG_LABEL: Record<string, string> = { fr: "French", en: "English", bilingual: "Bilingual" };

function singleString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SubstitutesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rankAgainstRequestId = singleString(params.rank_against_request_id);

  const data = await getAdminSubstitutes({ rankAgainstRequestId });
  const { items, rank_against } = data;
  const ranked = rank_against !== null;

  return (
    <PageFrame
      eyebrow="The pool"
      title={ranked ? "Ranked against a request" : "Substitutes"}
      description={
        ranked
          ? "Workers in your network ranked by match against an open request — language, qualifications, city, availability."
          : "Browse the substitute pool. Open a request and choose 'Rank substitutes' to score everyone against it."
      }
    >
      {ranked && rank_against ? (
        <div
          style={{
            background: "var(--ink)",
            color: "var(--paper)",
            borderRadius: "var(--r-md)",
            padding: "14px 18px",
            marginBottom: 18,
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 11,
              color: "rgba(246, 244, 238, 0.6)",
              letterSpacing: ".18em",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            <Sparkles size={14} strokeWidth={1.6} />
            Ranking by match against
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              background: "rgba(246, 244, 238, 0.06)",
              borderRadius: 8,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--mono)",
                color: "rgba(246, 244, 238, 0.55)",
                letterSpacing: ".06em",
              }}
            >
              <Mono>{rank_against.id.slice(0, 8).toUpperCase()}</Mono>
            </span>
            <span style={{ fontSize: 12, fontWeight: 500 }}>{rank_against.title}</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <DarkChip>{rank_against.city}</DarkChip>
            {rank_against.language_requirement && (
              <DarkChip>{LANG_LABEL[rank_against.language_requirement] ?? rank_against.language_requirement}</DarkChip>
            )}
            {rank_against.required_qualifications.slice(0, 2).map((q) => (
              <DarkChip key={q}>{q}</DarkChip>
            ))}
            {rank_against.required_certifications.slice(0, 2).map((c) => (
              <DarkChip key={c}>{c}</DarkChip>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <Link
            href="/admin/substitutes"
            style={{
              background: "transparent",
              border: 0,
              color: "rgba(246, 244, 238, 0.7)",
              cursor: "pointer",
              fontSize: 12,
              fontFamily: "var(--ui)",
              textDecoration: "none",
            }}
          >
            Clear
          </Link>
        </div>
      ) : null}

      <AdminSubstitutesTable rows={items} ranked={ranked} />

      <p style={{ marginTop: 16, color: "var(--ink-3)", fontSize: 12 }}>
        Ranking factors: language · qualifications · certifications · city match · availability.
      </p>
    </PageFrame>
  );
}

function DarkChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        padding: "4px 10px",
        fontSize: 11,
        fontWeight: 500,
        borderRadius: 8,
        background: "rgba(246, 244, 238, 0.08)",
        color: "rgba(246, 244, 238, 0.92)",
        border: "0.5px solid rgba(246, 244, 238, 0.12)",
      }}
    >
      {children}
    </span>
  );
}
