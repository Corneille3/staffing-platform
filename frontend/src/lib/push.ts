"use client";

// Web Push client helpers (PWA). The service worker lives at /sw.js (root
// scope, outside the locale prefix); the backend stores one subscription row
// per device and pushes via VAPID — see lib/browser-api.ts for the endpoints.

import { fetchPushPublicKey, removePushSubscription, savePushSubscription } from "./browser-api";
import { TIMED_OUT, withTimeout } from "./with-timeout";

export type PushEnableResult =
  | "enabled"
  | "denied"
  | "unsupported"
  | "unavailable"
  // The permission prompt is still unanswered — desktop Chrome often shows it
  // as a quiet bell in the address bar, and requestPermission() waits forever.
  | "permission_pending"
  // The service worker or the browser's push service never answered.
  | "timeout";

// How long the switch waits on each browser step before giving up. The
// permission prompt gets longer: a person may be reading it.
const PERMISSION_TIMEOUT_MS = 20_000;
const STEP_TIMEOUT_MS = 15_000;

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS 13+ reports as "MacIntel" with touch support.
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

export async function enablePush(workerId: string): Promise<PushEnableResult> {
  if (!isPushSupported()) return "unsupported";
  const publicKey = await fetchPushPublicKey();
  if (!publicKey) return "unavailable";

  const registration = await registerServiceWorker();
  if (!registration) return "unsupported";
  if ((await withTimeout(navigator.serviceWorker.ready, STEP_TIMEOUT_MS)) === TIMED_OUT) return "timeout";

  const permission = await withTimeout(Notification.requestPermission(), PERMISSION_TIMEOUT_MS);
  if (permission === TIMED_OUT) return "permission_pending";
  if (permission !== "granted") return "denied";

  const subscription = await withTimeout(
    (async () =>
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })))(),
    STEP_TIMEOUT_MS,
  );
  if (subscription === TIMED_OUT) return "timeout";

  const json = subscription.toJSON();
  await savePushSubscription(workerId, {
    endpoint: subscription.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
    user_agent: navigator.userAgent,
  });
  return "enabled";
}

/**
 * Re-post the device's existing subscription for the signed-in worker. A
 * shared phone keeps ONE browser subscription, registered under whichever
 * account last enabled alerts; signing in as someone else never moved it, so
 * the phone kept getting the previous person's offers (« Out of scope. » on
 * tap). The server upserts by endpoint, so this hands the endpoint to the
 * current account. No-op when the device never opted in.
 */
export async function reattachPush(workerId: string): Promise<boolean> {
  const subscription = await currentSubscription();
  if (!subscription) return false;
  const json = subscription.toJSON();
  await savePushSubscription(workerId, {
    endpoint: subscription.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
    user_agent: navigator.userAgent,
  });
  return true;
}

export async function disablePush(workerId: string): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  if ((await withTimeout(subscription.unsubscribe(), STEP_TIMEOUT_MS)) === TIMED_OUT) {
    throw new Error("Push unsubscribe timed out");
  }
  // Best effort — a dead row also gets pruned server-side on next 410.
  try {
    await removePushSubscription(workerId, endpoint);
  } catch {
    /* ignore */
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}
