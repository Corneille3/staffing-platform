"use client";

import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { fetchWorkers } from "./browser-api";
import { Worker } from "./types";

const STORAGE_KEY = "apf.workerId";

type WorkerSessionValue = {
  worker: Worker | null;
  workers: Worker[];
  loading: boolean;
  error: string | null;
  selectWorker: (id: string) => void;
  refresh: () => Promise<void>;
};

const WorkerSessionContext = createContext<WorkerSessionValue | null>(null);

export function WorkerSessionProvider({ children }: { children: ReactNode }) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workerId, setWorkerId] = useState<string | null>(null);
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
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setWorkerId(stored);
    load();
  }, []);

  function selectWorker(id: string) {
    setWorkerId(id);
    window.localStorage.setItem(STORAGE_KEY, id);
  }

  const worker = workers.find((w) => w.id === workerId) || null;

  return (
    <WorkerSessionContext.Provider
      value={{ worker, workers, loading, error, selectWorker, refresh: load }}
    >
      {children}
    </WorkerSessionContext.Provider>
  );
}

export function useWorkerSession() {
  const value = useContext(WorkerSessionContext);
  if (!value) throw new Error("useWorkerSession must be used inside WorkerSessionProvider");
  return value;
}
