"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useRef } from "react";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

type ClerkLike = { session?: { getToken: () => Promise<string | null> } };

export function ClerkSyncBoundary() {
  const { isLoaded, isSignedIn, user } = useUser();
  const synced = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return;
    if (synced.current === user.id) return;

    const userId = user.id;
    synced.current = userId;

    void (async () => {
      const clerk = (window as unknown as { Clerk?: ClerkLike }).Clerk;
      const token = await clerk?.session?.getToken();
      if (!token) return;

      try {
        const response = await fetch(`${BASE}/api/v1/auth/sync`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          synced.current = null;
          console.error(`User sync failed (${response.status})`);
        }
      } catch (err) {
        synced.current = null;
        console.error("User sync error:", err);
      }
    })();
  }, [isLoaded, isSignedIn, user]);

  return null;
}
