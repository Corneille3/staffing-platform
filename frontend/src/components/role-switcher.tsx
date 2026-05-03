"use client";

import { useRouter } from "next/navigation";
import { Role, ROLE_HOME, ROLE_LABEL, useRole } from "../lib/role-context";

const ROLES: Role[] = ["worker", "org_admin", "network_admin"];

export function RoleSwitcher() {
  const router = useRouter();
  const { role, setRole, ready } = useRole();

  if (!ready) return null;

  function pick(next: Role) {
    setRole(next);
    router.push(ROLE_HOME[next]);
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 1000,
        display: "flex",
        gap: 6,
        padding: 6,
        borderRadius: 999,
        background: "rgba(24, 50, 41, 0.92)",
        boxShadow: "0 12px 28px rgba(24, 50, 41, 0.28)",
        backdropFilter: "blur(8px)",
      }}
    >
      <span
        style={{
          alignSelf: "center",
          color: "#cdd9c8",
          fontSize: 11,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          padding: "0 8px",
        }}
      >
        Role
      </span>
      {ROLES.map((candidate) => {
        const active = candidate === role;
        return (
          <button
            key={candidate}
            type="button"
            onClick={() => pick(candidate)}
            style={{
              border: 0,
              borderRadius: 999,
              padding: "8px 12px",
              background: active ? "#f7f0df" : "transparent",
              color: active ? "#183229" : "#f7f0df",
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: "0.04em",
              cursor: "pointer",
            }}
          >
            {ROLE_LABEL[candidate]}
          </button>
        );
      })}
    </div>
  );
}
