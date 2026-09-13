"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Phone } from "lucide-react";
import { updateCoordinatorPhone } from "../lib/browser-api";
import { Mono, SaveFlash, useSaveFlash } from "./ui";

const AMBER = "#8C6B14";

/**
 * Inline phone editor for one row of /apf/coordinators (parked #7).
 * Read mode shows the number, or an amber "No number" hint — that's a
 * coordinator the no-show SMS can't reach. Click → input; Enter or blur
 * saves, Escape cancels, with the shared Saved flash. Keeps its own state
 * after a save so the server row needs no refresh.
 */
export function CoordinatorPhoneCell({
  coordinatorId,
  initialPhone,
}: {
  coordinatorId: string;
  initialPhone: string | null;
}) {
  const tCommon = useTranslations("common");
  const flash = useSaveFlash();
  const [saved, setSaved] = useState(initialPhone ?? "");
  const [draft, setDraft] = useState(initialPhone ?? "");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Escape unmounts the input; whether the browser then fires blur is not
  // consistent, so the blur handler checks this flag instead of guessing.
  const cancelled = useRef(false);
  const inflight = useRef(false);

  function open() {
    cancelled.current = false;
    setDraft(saved);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    cancelled.current = true;
    setDraft(saved);
    setEditing(false);
  }

  async function commit() {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (inflight.current) return;
    const next = draft.trim();
    if (next === saved.trim()) {
      setEditing(false);
      return;
    }
    inflight.current = true;
    setError(null);
    flash.start();
    try {
      const row = await updateCoordinatorPhone(coordinatorId, next);
      setSaved(row.phone ?? "");
      setDraft(row.phone ?? "");
      flash.succeed();
      setEditing(false);
    } catch (err) {
      flash.fail();
      setError(err instanceof Error && err.message ? err.message : "Could not save the number.");
    } finally {
      inflight.current = false;
    }
  }

  const hasPhone = saved.trim().length > 0;

  return (
    <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
      {editing ? (
        <span style={{ position: "relative", display: "flex", alignItems: "center", maxWidth: 200 }}>
          <Phone size={12} style={{ position: "absolute", left: 9, color: "var(--ink-3)", pointerEvents: "none" }} />
          <input
            type="tel"
            inputMode="tel"
            autoComplete="off"
            autoFocus
            aria-label="Mobile number"
            value={draft}
            placeholder="+1 514 555 0100"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") cancel();
            }}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "6px 8px 6px 26px",
              borderRadius: 8,
              border: "0.5px solid var(--terra)",
              background: "var(--paper)",
              color: "var(--ink)",
              fontSize: 12,
              fontFamily: "var(--mono)",
              minHeight: 32,
              outline: "none",
            }}
          />
        </span>
      ) : (
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <button
            type="button"
            onClick={open}
            title={hasPhone ? "Edit mobile number" : "Add a mobile number"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 8px",
              margin: "0 0 0 -8px",
              borderRadius: 8,
              border: "0.5px solid transparent",
              background: "transparent",
              color: hasPhone ? "var(--ink)" : AMBER,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 12,
              minHeight: 32,
              minWidth: 0,
            }}
          >
            <Phone size={12} style={{ color: hasPhone ? "var(--ink-3)" : AMBER, flexShrink: 0 }} />
            {hasPhone ? (
              <Mono style={{ fontSize: 12 }}>{saved}</Mono>
            ) : (
              <span style={{ fontStyle: "italic" }}>No number</span>
            )}
            <Pencil size={11} style={{ color: "var(--ink-3)", flexShrink: 0 }} aria-hidden />
          </button>
          <SaveFlash
            state={flash.state}
            savingLabel={tCommon("saving")}
            savedLabel={tCommon("saved")}
            style={{ fontSize: 11 }}
          />
        </span>
      )}
      {editing ? (
        <SaveFlash
          state={flash.state}
          savingLabel={tCommon("saving")}
          savedLabel={tCommon("saved")}
          style={{ fontSize: 11 }}
        />
      ) : null}
      {error ? <span style={{ fontSize: 11, color: "var(--rose)", fontWeight: 600 }}>{error}</span> : null}
    </div>
  );
}
