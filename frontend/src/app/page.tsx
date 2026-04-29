"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ROLE_HOME, useRole } from "../lib/role-context";

export default function RootPage() {
  const router = useRouter();
  const { role, ready } = useRole();

  useEffect(() => {
    if (ready) {
      router.replace(ROLE_HOME[role]);
    }
  }, [ready, role, router]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        color: "#183229",
        fontSize: 14,
        opacity: 0.7,
      }}
    >
      Loading…
    </div>
  );
}
