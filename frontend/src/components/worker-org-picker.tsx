"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchWorkerOrganizations, updateWorkerOrganizations } from "../lib/browser-api";
import type { WorkerOrganizationOption } from "../lib/types";
import { SaveFlash, useSaveFlash } from "./ui";

/** Org opt-in chips (worker_organizations). Opt-out model: nothing selected
 * = open to every org in the tenant; each toggle saves the full set. Used on
 * the availability page; onboarding renders its own inline variant. */
export function WorkerOrgPicker({ workerId }: { workerId: string }) {
  const t = useTranslations("worker.organizations");
  const [items, setItems] = useState<WorkerOrganizationOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const flash = useSaveFlash();

  useEffect(() => {
    let alive = true;
    fetchWorkerOrganizations(workerId)
      .then((data) => alive && setItems(data.items))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Load failed"));
    return () => { alive = false; };
  }, [workerId]);

  // A tenant with a single org has nothing to choose — hide the card.
  if (items !== null && items.length < 2) return null;

  async function toggle(orgId: string) {
    if (!items) return;
    const next = items.map((i) =>
      i.organization_id === orgId ? { ...i, selected: !i.selected } : i,
    );
    setItems(next);
    setError(null);
    flash.start();
    try {
      const saved = await updateWorkerOrganizations(
        workerId,
        next.filter((i) => i.selected).map((i) => i.organization_id),
      );
      setItems(saved.items);
      flash.succeed();
    } catch (e) {
      setItems(items); // roll the optimistic flip back
      setError(e instanceof Error ? e.message : "Save failed");
      flash.fail();
    }
  }

  const anySelected = items?.some((i) => i.selected) ?? false;

  return (
    <section style={{
      background: "var(--card)",
      border: "0.5px solid var(--line)",
      borderRadius: 18,
      padding: 18,
      display: "grid",
      gap: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>
          {t("title")}
        </div>
        <SaveFlash state={flash.state} />
      </div>
      <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.5 }}>
        {anySelected ? t("hintRestricted") : t("hintOpen")}
      </p>
      {items === null ? (
        <div style={{ fontSize: 13, color: "var(--ink-3)" }}>{error ?? "…"}</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {items.map((org) => (
            <button
              key={org.organization_id}
              type="button"
              onClick={() => toggle(org.organization_id)}
              style={{
                padding: "10px 15px",
                minHeight: 44,
                borderRadius: 99,
                border: `0.5px solid ${org.selected ? "transparent" : "var(--line)"}`,
                background: org.selected ? "var(--ink)" : "var(--card)",
                color: org.selected ? "var(--paper)" : "var(--ink)",
                fontSize: 13.5,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {org.name}
            </button>
          ))}
        </div>
      )}
      {error && items !== null && (
        <p style={{ margin: 0, color: "var(--rose)", fontSize: 12 }}>{error}</p>
      )}
    </section>
  );
}
