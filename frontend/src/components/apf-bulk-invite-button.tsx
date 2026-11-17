"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ApfBulkInviteModal } from "./apf-bulk-invite-modal";

export function ApfBulkInviteButton() {
  const [open, setOpen] = useState(false);
  const t = useTranslations("apf.pool");
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: "inline-block",
          padding: "10px 18px",
          borderRadius: 999,
          background: "var(--terra)",
          color: "var(--paper)",
          fontSize: 14,
          fontWeight: 500,
          border: 0,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {t("bulkInvite")}
      </button>
      {open && <ApfBulkInviteModal onClose={() => setOpen(false)} />}
    </>
  );
}
