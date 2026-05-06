"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";

export type Role = "worker" | "org_admin" | "network_admin" | "platform_admin";

const STORAGE_KEY = "apf.devRole";
const DEFAULT_ROLE: Role = "org_admin";
const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const DEV_ROLE_OVERRIDE_ENABLED = process.env.NODE_ENV !== "production";

type SyncedUser = {
  role: string;
};

type RoleContextValue = {
  role: Role;
  setRole: (next: Role) => void;
  ready: boolean;
};

const RoleContext = createContext<RoleContextValue | null>(null);

function isRole(value: unknown): value is Role {
  return value === "worker" || value === "org_admin" || value === "network_admin" || value === "platform_admin";
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
  const { isLoaded, isSignedIn } = useUser();
  const { getToken } = useAuth();
  const [role, setRoleState] = useState<Role>(DEFAULT_ROLE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;

    async function syncCurrentUser() {
      if (!isLoaded) return;
      if (!isSignedIn) {
        if (alive) setReady(true);
        return;
      }

      if (alive) setReady(false);
      try {
        const token = await getToken();
        if (!token) {
          if (alive) setReady(true);
          return;
        }

        const response = await fetch(`${API_BASE}/api/v1/auth/sync`, {
          method: "POST",
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error(`User sync failed (${response.status})`);
        }

        const syncedUser = (await response.json()) as SyncedUser;
        const syncedRole = isRole(syncedUser.role) ? syncedUser.role : DEFAULT_ROLE;
        const override = DEV_ROLE_OVERRIDE_ENABLED ? readStoredOverride() : null;
        if (alive) setRoleState(override ?? syncedRole);
      } catch (err) {
        console.error("User sync error:", err);
        if (alive) setRoleState(DEFAULT_ROLE);
      } finally {
        if (alive) setReady(true);
      }
    }

    void syncCurrentUser();
    return () => {
      alive = false;
    };
  }, [getToken, isLoaded, isSignedIn]);

  function setRole(next: Role) {
    if (!DEV_ROLE_OVERRIDE_ENABLED) return;
    setRoleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <RoleContext.Provider value={{ role, setRole, ready }}>
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
  network_admin: "/apf",
  platform_admin: "/apf",
};

export const ROLE_LABEL: Record<Role, string> = {
  worker: "Substitute",
  org_admin: "Coordinator",
  network_admin: "Network Admin",
  platform_admin: "Platform Admin",
};
