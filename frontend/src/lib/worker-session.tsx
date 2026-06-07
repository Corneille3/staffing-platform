"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { createContext, ReactNode, useContext, useEffect, useRef, useState } from "react";
import { fetchWorkers } from "./browser-api";
import { Worker } from "./types";

const STORAGE_KEY = "apf.workerId";
const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const DEV_WORKER_OVERRIDE_ENABLED = process.env.NODE_ENV !== "production";

export function canUseWorkerOverride() {
  return DEV_WORKER_OVERRIDE_ENABLED;
}

type WorkerSessionValue = {
  worker: Worker | null;
  workers: Worker[];
  loading: boolean;
  error: string | null;
  selectWorker: (id: string) => void;
  refresh: () => Promise<void>;
};

const WorkerSessionContext = createContext<WorkerSessionValue | null>(null);

type SharedState = {
  workers: Worker[];
  override: string | null;
  loading: boolean;
  error: string | null;
  selectWorker: (id: string) => void;
  refresh: () => Promise<void>;
};

function useSharedState(enabled: boolean): SharedState {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [override, setOverride] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  async function load() {
    // Only gate the UI on the initial load. Later refreshes (e.g. after a
    // preference save) update silently — flipping `loading` here would make
    // the worker layout swap the page for its loading screen mid-interaction,
    // unmounting the page (and any transient UI state like save flashes).
    if (!hasLoadedRef.current) setLoading(true);
    try {
      const list = await fetchWorkers();
      setWorkers(list);
      setError(null);
      hasLoadedRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Wait until the caller signals it's safe to fetch (e.g. Clerk session
    // has finished hydrating). Without this guard, on page refresh the
    // fetch can fire before the Clerk JWT is ready and the backend
    // rejects with 401 "no Bearer token".
    if (!enabled) return;
    if (!DEV_WORKER_OVERRIDE_ENABLED) {
      load();
      return;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setOverride(stored);
    load();
  }, [enabled]);

  function selectWorker(id: string) {
    if (!DEV_WORKER_OVERRIDE_ENABLED) return;
    setOverride(id);
    window.localStorage.setItem(STORAGE_KEY, id);
  }

  return { workers, override, loading, error, selectWorker, refresh: load };
}

function DevWorkerSessionProvider({ children }: { children: ReactNode }) {
  // Dev path has no Clerk; always safe to fetch immediately.
  const { workers, override, loading, error, selectWorker, refresh } = useSharedState(true);
  const worker = override ? workers.find((w) => w.id === override) || null : null;

  return (
    <WorkerSessionContext.Provider
      value={{ worker, workers, loading, error, selectWorker, refresh }}
    >
      {children}
    </WorkerSessionContext.Provider>
  );
}

function ClerkWorkerSessionProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const { isLoaded } = useAuth();
  // Defer the workers fetch until Clerk has hydrated the session, so
  // ``authHeaders()`` can actually attach a Bearer token.
  const { workers, override, loading, error, selectWorker, refresh } = useSharedState(isLoaded);

  const matchedByClerk = user ? workers.find((w) => w.clerk_user_id === user.id) || null : null;
  const overrideWorker = DEV_WORKER_OVERRIDE_ENABLED && override
    ? workers.find((w) => w.id === override) || null
    : null;

  // In local dev, an explicit override can preview another worker. Production
  // always uses the Clerk-linked worker.
  const worker = overrideWorker ?? matchedByClerk;

  return (
    <WorkerSessionContext.Provider
      value={{ worker, workers, loading, error, selectWorker, refresh }}
    >
      {children}
    </WorkerSessionContext.Provider>
  );
}

export function WorkerSessionProvider({ children }: { children: ReactNode }) {
  return CLERK_ENABLED ? (
    <ClerkWorkerSessionProvider>{children}</ClerkWorkerSessionProvider>
  ) : (
    <DevWorkerSessionProvider>{children}</DevWorkerSessionProvider>
  );
}

export function useWorkerSession() {
  const value = useContext(WorkerSessionContext);
  if (!value) throw new Error("useWorkerSession must be used inside WorkerSessionProvider");
  return value;
}
