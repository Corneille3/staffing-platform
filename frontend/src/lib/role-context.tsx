"use client";

import { createContext, ReactNode, useContext, useEffect, useState } from "react";

export type Role = "worker" | "org_admin" | "apf_admin";

const STORAGE_KEY = "apf.devRole";
const DEFAULT_ROLE: Role = "org_admin";

type RoleContextValue = {
  role: Role;
  setRole: (next: Role) => void;
  ready: boolean;
};

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(DEFAULT_ROLE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "worker" || stored === "org_admin" || stored === "apf_admin") {
      setRoleState(stored);
    }
    setReady(true);
  }, []);

  function setRole(next: Role) {
    setRoleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <RoleContext.Provider value={{ role, setRole, ready }}>{children}</RoleContext.Provider>
  );
}

export function useRole() {
  const value = useContext(RoleContext);
  if (!value) {
    throw new Error("useRole must be used inside RoleProvider");
  }
  return value;
}

export const ROLE_HOME: Record<Role, string> = {
  worker: "/worker",
  org_admin: "/admin",
  apf_admin: "/apf",
};

export const ROLE_LABEL: Record<Role, string> = {
  worker: "Worker",
  org_admin: "Org Admin",
  apf_admin: "APF Admin",
};
