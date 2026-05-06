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
        border: "1px solid currentColor",
        borderRadius: 999,
        padding: "8px 14px",
        color: "inherit",
        font: "inherit",
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        cursor: "pointer",
        opacity: 0.85,
      }}
    >
      Sign out
    </button>
  );
}
