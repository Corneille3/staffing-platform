"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Sparkles } from "lucide-react";
import { errorMessageFromResponse } from "../lib/browser-api";
import type { EligibilityReason, Worker } from "../lib/types";

const browserApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
type ClerkLike = { session?: { getToken: () => Promise<string | null> } };

const LANG_LABEL: Record<string, string> = { fr: "French", en: "English", bilingual: "Bilingual" };

interface Props {
  worker: Worker;
  matchScore: number;
  reasons: EligibilityReason[];
  requestId: string;
}

function initials(first: string, last: string): string {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

function tagsFromReasons(worker: Worker, reasons: EligibilityReason[]): string[] {
  const tags: string[] = [];
  // Language
  const langReason = reasons.find((r) => r.type === "language");
  if (langReason?.status === "matched") {
    tags.push(`${LANG_LABEL[worker.preferred_language] ?? worker.preferred_language.toUpperCase()} · primary`);
  } else if (langReason) {
    tags.push(`Missing language`);
  }
  // City
  const cityReason = reasons.find((r) => r.type === "city");
  if (cityReason?.status === "matched") {
    tags.push(`${cityReason.code ?? "City"} ✓`);
  } else if (cityReason?.code) {
    tags.push(`No ${cityReason.code} coverage`);
  }
  // Availability
  const availReason = reasons.find((r) => r.type === "availability");
  if (availReason?.status === "matched") {
    tags.push("Available today");
  } else if (availReason) {
    tags.push("Unavailable");
  }
  // Qualifications (matched count)
  const qualReasons = reasons.filter((r) => r.type === "qualification");
  if (qualReasons.length > 0) {
    const matched = qualReasons.filter((r) => r.status === "matched").length;
    if (matched === qualReasons.length) {
      tags.push("Qualifications ✓");
    } else {
      tags.push(`Missing ${qualReasons.length - matched} qual`);
    }
  }
  return tags.slice(0, 4);
}

export function BestMatchCard({ worker, matchScore, reasons, requestId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function assign() {
    setError(null);
    try {
      let token: string | null = null;
      if (CLERK_ENABLED && typeof window !== "undefined") {
        token = (await (window as unknown as { Clerk?: ClerkLike }).Clerk?.session?.getToken()) ?? null;
      }
      const resp = await fetch(`${browserApiBaseUrl}/api/v1/assignments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          staffing_request_id: requestId,
          worker_user_id: worker.id,
          notes: "Assigned from Best match card",
        }),
      });
      if (!resp.ok) {
        throw new Error(await errorMessageFromResponse(resp, `Assign failed (${resp.status})`));
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assign failed");
    }
  }

  const tags = tagsFromReasons(worker, reasons);
  const fullName = `${worker.first_name} ${worker.last_name}`;

  return (
    <div
      style={{
        background: "var(--ink)",
        color: "var(--paper)",
        borderRadius: "var(--r-lg)",
        padding: "20px 22px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: ".18em",
          textTransform: "uppercase",
          color: "rgba(246, 244, 238, 0.6)",
          marginBottom: 10,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Sparkles size={12} strokeWidth={1.8} />
        Best match
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 99,
            background: "var(--terra)",
            color: "var(--paper)",
            fontSize: 16,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {initials(worker.first_name, worker.last_name)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--serif)",
              fontSize: 22,
              lineHeight: 1.1,
              fontWeight: 400,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {fullName}
          </div>
          <div style={{ fontSize: 12, color: "rgba(246, 244, 238, 0.7)", marginTop: 2 }}>
            {worker.profile?.qualifications?.[0] ?? "Substitute"} · {matchScore}% match
          </div>
        </div>
      </div>

      {tags.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            marginBottom: 16,
          }}
        >
          {tags.map((t) => (
            <div
              key={t}
              style={{
                padding: "6px 10px",
                fontSize: 11,
                fontWeight: 500,
                borderRadius: 8,
                background: "rgba(246, 244, 238, 0.08)",
                color: "rgba(246, 244, 238, 0.92)",
                border: "0.5px solid rgba(246, 244, 238, 0.12)",
                textAlign: "center",
              }}
            >
              {t}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={assign}
        disabled={pending}
        style={{
          width: "100%",
          background: "var(--terra)",
          color: "var(--paper)",
          border: 0,
          padding: "11px 16px",
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 500,
          cursor: pending ? "not-allowed" : "pointer",
          opacity: pending ? 0.6 : 1,
          fontFamily: "var(--ui)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        {pending ? "Assigning…" : `Assign ${worker.first_name}`}
        {!pending && <Check size={14} strokeWidth={2.2} />}
      </button>

      {error && (
        <p
          style={{
            margin: "10px 0 0",
            fontSize: 12,
            color: "var(--rose-soft)",
            lineHeight: 1.4,
          }}
        >
          {error}
        </p>
      )}

      <p
        style={{
          textAlign: "center",
          marginTop: 10,
          marginBottom: 0,
          fontSize: 11,
          color: "rgba(246, 244, 238, 0.6)",
          lineHeight: 1.4,
        }}
      >
        Workflow card below has the same controls.
      </p>
    </div>
  );
}
