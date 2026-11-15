"use client";

import { useRouter } from "../i18n/navigation";
import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";

type Site = { id: string; name: string; city: string | null };

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

export function AdminOrgSwitcher({
  sites,
  label,
  sublabel,
  multiOrg,
}: {
  sites: Site[];
  label: string;
  sublabel: string;
  multiOrg: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const switchable = sites.length > 1;

  return (
    <div style={{ position: "relative", marginBottom: 14 }}>
      <button
        onClick={() => switchable && setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          background: "var(--card)",
          border: "0.5px solid var(--line)",
          borderRadius: 10,
          cursor: switchable ? "pointer" : "default",
          fontFamily: "var(--ui)",
          textAlign: "left",
        }}
      >
        <div style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 6, background: "var(--ink)", color: "var(--paper)", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {multiOrg ? "ST" : initials(label)}
        </div>
        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
          <div style={{ fontSize: 10, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sublabel}</div>
        </div>
        {switchable && <ChevronsUpDown size={14} color="var(--ink-3)" style={{ flexShrink: 0 }} />}
      </button>

      {open && switchable && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              zIndex: 21,
              background: "var(--card)",
              border: "0.5px solid var(--line)",
              borderRadius: 10,
              padding: 4,
              boxShadow: "0 8px 24px rgba(21,20,15,.12)",
            }}
          >
            <SwitchItem label="All sites" onClick={() => { setOpen(false); router.push("/admin/requests"); }} />
            {sites.map((s) => (
              <SwitchItem
                key={s.id}
                label={s.name}
                sub={s.city ?? undefined}
                onClick={() => { setOpen(false); router.push(`/admin/requests?site_id=${s.id}`); }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SwitchItem({ label, sub, onClick }: { label: string; sub?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        background: "transparent",
        border: "none",
        borderRadius: 8,
        cursor: "pointer",
        fontFamily: "var(--ui)",
        textAlign: "left",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{sub}</div>}
      </div>
    </button>
  );
}
