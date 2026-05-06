"use client";

import { useUser } from "@clerk/nextjs";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
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

function useSharedState(): SharedState {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [override, setOverride] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const list = await fetchWorkers();
      setWorkers(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!DEV_WORKER_OVERRIDE_ENABLED) {
      load();
      return;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setOverride(stored);
    load();
  }, []);

  function selectWorker(id: string) {
    if (!DEV_WORKER_OVERRIDE_ENABLED) return;
    setOverride(id);
    window.localStorage.setItem(STORAGE_KEY, id);
  }

  return { workers, override, loading, error, selectWorker, refresh: load };
}

function DevWorkerSessionProvider({ children }: { children: ReactNode }) {
  const { workers, override, loading, error, selectWorker, refresh } = useSharedState();
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
  const { workers, override, loading, error, selectWorker, refresh } = useSharedState();

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
