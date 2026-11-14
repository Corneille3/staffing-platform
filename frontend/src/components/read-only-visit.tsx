"use client";

import { createContext, useContext, type ReactNode } from "react";
import { Eye } from "lucide-react";

/**
 * A platform operator inside a tenant through a §2.2 access grant is
 * read-only: the backend 403s every write at scope resolution. This context
 * carries that fact from the surface layout down to the pages so they stop
 * offering controls that can only fail. Outside a provider nothing is hidden.
 */
const ReadOnlyVisitContext = createContext(false);

export function ReadOnlyVisitProvider({ readOnly, children }: { readOnly: boolean; children: ReactNode }) {
  return <ReadOnlyVisitContext.Provider value={readOnly}>{children}</ReadOnlyVisitContext.Provider>;
}

export function useReadOnlyVisit(): boolean {
  return useContext(ReadOnlyVisitContext);
}

/** Renders `children` except during a read-only visit, where it renders
 * `fallback` (nothing by default). Server pages render this wrapper around
 * their write controls. */
export function HideOnReadOnlyVisit({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return <>{useReadOnlyVisit() ? fallback : children}</>;
}

/** Stands in for a whole write form reached by URL during a visit. */
export function ReadOnlyVisitNotice() {
  return (
    <div
      role="note"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        maxWidth: 560,
        padding: "16px 18px",
        borderRadius: "var(--r-lg)",
        background: "var(--sand-soft)",
        border: "0.5px solid var(--sand)",
        color: "var(--ink)",
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      <Eye size={16} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
      <span>
        <strong style={{ fontWeight: 600 }}>Read-only visit.</strong> This action isn&apos;t available during a
        support access visit — only the network&apos;s own administrators can make changes.
      </span>
    </div>
  );
}
