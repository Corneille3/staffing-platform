"use client";

import { useState } from "react";
import { ReplacementPolicyCard } from "./replacement-policy-card";

type OrgOption = { id: string; name: string };

/** Right-rail policy panel for /admin/replacements. A single-org tenant gets
 * the bare card, unchanged. A multi-org tenant gets a pill row to pick which
 * site's policy is being viewed/edited — the card is keyed by org id so
 * switching remounts it and re-fetches that org's policy. */
export function ReplacementPolicyPanel({ organizations }: { organizations: OrgOption[] }) {
  const [selectedId, setSelectedId] = useState(organizations[0]?.id ?? null);

  if (organizations.length === 0) return null;
  const selected = organizations.find((o) => o.id === selectedId) ?? organizations[0];

  return (
    <div>
      {organizations.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>
          {organizations.map((org) => {
            const active = org.id === selected.id;
            return (
              <button
                key={org.id}
                type="button"
                onClick={() => setSelectedId(org.id)}
                style={{
                  padding: "7px 13px",
                  borderRadius: 99,
                  border: `0.5px solid ${active ? "transparent" : "var(--line)"}`,
                  background: active ? "var(--ink)" : "#fff",
                  color: active ? "var(--paper)" : "var(--ink)",
                  fontSize: 12.5,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {org.name}
              </button>
            );
          })}
        </div>
      )}
      <ReplacementPolicyCard
        key={selected.id}
        organizationId={selected.id}
        organizationName={selected.name}
      />
    </div>
  );
}
