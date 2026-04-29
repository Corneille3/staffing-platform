"use client";

import { useUser } from "@clerk/nextjs";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";

export type Role = "worker" | "org_admin" | "apf_admin";

const STORAGE_KEY = "apf.devRole";
const DEFAULT_ROLE: Role = "org_admin";
const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

type RoleContextValue = {
  role: Role;
  setRole: (next: Role) => void;
  ready: boolean;
};

const RoleContext = createContext<RoleContextValue | null>(null);

function isRole(value: unknown): value is Role {
  return value === "worker" || value === "org_admin" || value === "apf_admin";
}

function readStoredOverride(): Role | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isRole(stored) ? stored : null;
}

function DevRoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(DEFAULT_ROLE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readStoredOverride();
    if (stored) setRoleState(stored);
    setReady(true);
  }, []);

  function setRole(next: Role) {
    setRoleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return <RoleContext.Provider value={{ role, setRole, ready }}>{children}</RoleContext.Provider>;
}

function ClerkRoleProvider({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser();
  const [override, setOverride] = useState<Role | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setOverride(readStoredOverride());
    setHydrated(true);
  }, []);

  const metadataRole = (() => {
    const candidate = user?.publicMetadata?.role;
    return isRole(candidate) ? candidate : null;
  })();

  const role: Role = override ?? metadataRole ?? DEFAULT_ROLE;

  function setRole(next: Role) {
    setOverride(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <RoleContext.Provider value={{ role, setRole, ready: isLoaded && hydrated }}>
      {children}
    </RoleContext.Provider>
  );
}

export function RoleProvider({ children }: { children: ReactNode }) {
  return CLERK_ENABLED ? (
    <ClerkRoleProvider>{children}</ClerkRoleProvider>
  ) : (
    <DevRoleProvider>{children}</DevRoleProvider>
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
