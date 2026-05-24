"use client";

import {
  AdminSubstitutesResponse,
  ApfActivity,
  ApfActivityFilter,
  ApfExportJob,
  ApfExportRequest,
  Assignment,
  AvailabilityGrid,
  BulkInviteEntry,
  BulkInviteResult,
  Coordinator,
  EligibilityResult,
  NotificationFeedItem,
  Organization,
  RequestResponse,
  SlotPeriod,
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

async function deleteJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `DELETE ${path} failed (${response.status})`);
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

export async function fetchApfActivity(
  params: { filter?: ApfActivityFilter; cursor?: string; limit?: number; orgId?: string } = {},
): Promise<ApfActivity> {
  const search = new URLSearchParams();
  if (params.filter && params.filter !== "all") search.set("filter", params.filter);
  if (params.cursor) search.set("cursor", params.cursor);
  if (params.limit) search.set("limit", String(params.limit));
  if (params.orgId) search.set("org_id", params.orgId);
  const qs = search.toString();
  return getJson<ApfActivity>(`/api/v1/apf/activity${qs ? `?${qs}` : ""}`);
}

export async function bulkInviteSubstitutes(
  invitees: BulkInviteEntry[],
): Promise<BulkInviteResult> {
  return postJson<BulkInviteResult>("/api/v1/apf/substitutes/invite", { invitees });
}

export async function recomputeReliability(): Promise<{ updated: number }> {
  return postJson<{ updated: number }>("/api/v1/apf/substitutes/recompute-reliability");
}

export async function createApfExport(payload: ApfExportRequest): Promise<ApfExportJob> {
  return postJson<ApfExportJob>("/api/v1/apf/export", payload);
}

export async function getApfExportJob(jobId: string): Promise<ApfExportJob> {
  return getJson<ApfExportJob>(`/api/v1/apf/export/${jobId}`);
}

export async function createAdminRequest(payload: Record<string, unknown>): Promise<StaffingRequest> {
  return postJson<StaffingRequest>("/api/v1/admin/requests", payload);
}

export async function patchAdminRequest(
  requestId: string,
  partial: Record<string, unknown>,
): Promise<StaffingRequest> {
  return patchJson<StaffingRequest>(`/api/v1/admin/requests/${requestId}`, partial);
}

export async function publishAdminRequest(requestId: string): Promise<StaffingRequest> {
  return postJson<StaffingRequest>(`/api/v1/requests/${requestId}/publish`);
}

export async function rankAdminSubstitutes(
  rankAgainstDraftId: string,
): Promise<AdminSubstitutesResponse> {
  const search = new URLSearchParams({ rank_against_draft_id: rankAgainstDraftId });
  return getJson<AdminSubstitutesResponse>(`/api/v1/admin/substitutes?${search.toString()}`);
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

export async function fetchRequest(requestId: string): Promise<StaffingRequest> {
  return getJson<StaffingRequest>(`/api/v1/requests/${requestId}`);
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

export async function markRequestViewed(
  requestId: string,
  workerUserId: string,
): Promise<RequestResponse> {
  return postJson<RequestResponse>(`/api/v1/requests/${requestId}/responses/view`, {
    worker_user_id: workerUserId,
  });
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

export async function withdrawRequest(
  requestId: string,
  workerUserId: string,
): Promise<RequestResponse> {
  return postJson<RequestResponse>(`/api/v1/requests/${requestId}/responses/withdraw`, {
    worker_user_id: workerUserId,
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
    notify_far?: boolean;
    notify_weekend_overnight?: boolean;
    supported_cities?: string[];
  },
): Promise<WorkerProfile> {
  return patchJson<WorkerProfile>(`/api/v1/workers/${workerId}/availability`, payload);
}

export async function inviteWorker(payload: {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  preferred_language?: string;
}): Promise<Worker> {
  return postJson<Worker>("/api/v1/workers/invite", payload);
}

export async function removeUser(userId: string): Promise<{ id: string; is_active: boolean }> {
  return deleteJson<{ id: string; is_active: boolean }>(`/api/v1/users/${userId}`);
}

export async function removeUserByEmail(email: string): Promise<{
  id: string;
  email: string;
  is_active: boolean;
}> {
  return postJson("/api/v1/users/remove-by-email", { email });
}

export async function fetchOrganizationsForTenant(): Promise<Organization[]> {
  const data = await getJson<{ items: Organization[] }>("/api/v1/organizations");
  return data.items;
}

export async function createOrganization(payload: {
  name: string;
  type: string;
  city: string;
  region?: string;
  contact_email?: string;
  contact_phone?: string;
  preferred_language: string;
}): Promise<Organization> {
  return postJson<Organization>("/api/v1/organizations", payload);
}

export type TenantNetwork = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  network_admin: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    preferred_language: string;
    clerk_user_id: string | null;
    is_active: boolean;
  } | null;
};

export async function listNetworks(): Promise<TenantNetwork[]> {
  const data = await getJson<{ items: TenantNetwork[] }>("/api/v1/networks");
  return data.items;
}

export async function createNetwork(payload: {
  name: string;
  slug: string;
  admin_first_name: string;
  admin_last_name: string;
  admin_email: string;
  admin_phone?: string;
  admin_preferred_language: string;
}): Promise<TenantNetwork> {
  return postJson<TenantNetwork>("/api/v1/networks", payload);
}

export async function removeNetwork(tenantId: string): Promise<TenantNetwork> {
  return deleteJson<TenantNetwork>(`/api/v1/networks/${tenantId}`);
}

export async function inviteCoordinator(payload: {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  preferred_language: string;
  org_ids: string[];
}): Promise<Coordinator> {
  return postJson<Coordinator>("/api/v1/coordinators/invite", payload);
}

export async function checkInAssignment(
  assignmentId: string,
  coords?: { latitude: number; longitude: number },
): Promise<Assignment> {
  return postJson<Assignment>(`/api/v1/assignments/${assignmentId}/check-in`, coords ?? {});
}

export async function fetchAvailabilityGrid(
  workerId: string,
  weekStart: string,
): Promise<AvailabilityGrid> {
  const params = new URLSearchParams({ week_start: weekStart });
  return getJson<AvailabilityGrid>(`/api/v1/workers/${workerId}/availability/grid?${params}`);
}

export async function saveAvailabilityGrid(
  workerId: string,
  weekStart: string,
  cells: { specific_date: string; slot: SlotPeriod; available: boolean }[],
): Promise<AvailabilityGrid> {
  return postJson<AvailabilityGrid>(`/api/v1/workers/${workerId}/availability/grid`, {
    week_start: weekStart,
    cells,
  });
}

export async function copyPreviousAvailabilityWeek(
  workerId: string,
  targetWeekStart: string,
): Promise<AvailabilityGrid> {
  return postJson<AvailabilityGrid>(
    `/api/v1/workers/${workerId}/availability/grid/copy-previous`,
    { target_week_start: targetWeekStart },
  );
}

export async function onboardWorker(
  workerId: string,
  payload: {
    availability_status: string;
    urgent_alert_opt_in: boolean;
    supported_cities: string[];
    qualifications: string[];
    certifications: string[];
    preferred_language?: string;
  },
): Promise<WorkerProfile> {
  return postJson<WorkerProfile>(`/api/v1/workers/${workerId}/onboard`, payload);
}
