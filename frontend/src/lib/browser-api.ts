"use client";

import {
  Assignment,
  EligibilityResult,
  NotificationFeedItem,
  RequestResponse,
  StaffingRequest,
  Worker,
  WorkerProfile,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

type ClerkLike = { session?: { getToken: () => Promise<string | null> } };

async function authHeaders(): Promise<Record<string, string>> {
  if (!CLERK_ENABLED || typeof window === "undefined") return {};
  const clerk = (window as unknown as { Clerk?: ClerkLike }).Clerk;
  const token = await clerk?.session?.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    cache: "no-store",
    headers: await authHeaders(),
  });
  if (!response.ok) throw new Error(`GET ${path} failed (${response.status})`);
  return response.json();
}

async function postJson<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `POST ${path} failed (${response.status})`);
  }
  return response.json();
}

async function patchJson<T>(path: string, body: object): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `PATCH ${path} failed (${response.status})`);
  }
  return response.json();
}

export async function fetchWorkers(): Promise<Worker[]> {
  const data = await getJson<{ items: Worker[] }>("/api/v1/workers");
  return data.items;
}

export async function fetchWorker(workerId: string): Promise<Worker> {
  return getJson<Worker>(`/api/v1/workers/${workerId}`);
}

export async function fetchRequests(): Promise<StaffingRequest[]> {
  const data = await getJson<{ items: StaffingRequest[] }>("/api/v1/requests");
  return data.items;
}

export async function fetchRequestResponses(requestId: string): Promise<RequestResponse[]> {
  const data = await getJson<{ items: RequestResponse[] }>(
    `/api/v1/requests/${requestId}/responses`,
  );
  return data.items;
}

export async function fetchRequestEligibility(
  requestId: string,
  workerUserId: string,
): Promise<EligibilityResult> {
  const params = new URLSearchParams({ worker_user_id: workerUserId });
  return getJson<EligibilityResult>(`/api/v1/requests/${requestId}/eligibility?${params}`);
}

export async function fetchAssignments(): Promise<Assignment[]> {
  const data = await getJson<{ items: Assignment[] }>("/api/v1/assignments");
  return data.items;
}

export async function fetchNotificationFeed(workerUserId: string): Promise<NotificationFeedItem[]> {
  const params = new URLSearchParams({ worker_user_id: workerUserId });
  const data = await getJson<{ items: NotificationFeedItem[] }>(`/api/v1/notifications/feed?${params}`);
  return data.items;
}

export async function acceptRequest(
  requestId: string,
  workerUserId: string,
): Promise<RequestResponse> {
  return postJson<RequestResponse>(`/api/v1/requests/${requestId}/responses/accept`, {
    worker_user_id: workerUserId,
  });
}

export async function declineRequest(
  requestId: string,
  workerUserId: string,
  declineReason?: string,
): Promise<RequestResponse> {
  return postJson<RequestResponse>(`/api/v1/requests/${requestId}/responses/decline`, {
    worker_user_id: workerUserId,
    decline_reason: declineReason ?? null,
  });
}

export async function updateAvailability(
  workerId: string,
  status: "available" | "unavailable",
  urgentAlertOptIn?: boolean,
): Promise<WorkerProfile> {
  const body: { availability_status: "available" | "unavailable"; urgent_alert_opt_in?: boolean } = {
    availability_status: status,
  };
  if (urgentAlertOptIn !== undefined) body.urgent_alert_opt_in = urgentAlertOptIn;
  return patchJson<WorkerProfile>(`/api/v1/workers/${workerId}/availability`, body);
}

export async function updateWorkerPreferences(
  workerId: string,
  payload: {
    availability_status?: "available" | "unavailable";
    urgent_alert_opt_in?: boolean;
    supported_cities?: string[];
  },
): Promise<WorkerProfile> {
  return patchJson<WorkerProfile>(`/api/v1/workers/${workerId}/availability`, payload);
}
