"use client";

import { useClerk } from "@clerk/nextjs";

export function HeaderSignOutButton() {
  const { signOut } = useClerk();

  async function handleSignOut() {
    window.localStorage.removeItem("apf.workerId");
    window.localStorage.removeItem("apf.devRole");
    await signOut({ redirectUrl: "/sign-in" });
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      style={{
        background: "transparent",
        border: "0.5px solid var(--line)",
        borderRadius: 999,
        padding: "8px 14px",
        color: "var(--ink-2)",
        font: "inherit",
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      Sign out
    </button>
  );
}
