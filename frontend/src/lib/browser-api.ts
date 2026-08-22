"use client";

import {
  AbsenceSite,
  AdminActivity,
  AdminActivityFilter,
  AdminOrganizationSite,
  MyAbsenceItem,
  AdminRequestsResponse,
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
  OrphanScanResult,
  PlatformOperator,
  ReplacementPolicy,
  PlatformSettings,
  RequestResponse,
  SlotPeriod,
  StaffingRequest,
  TenantAccessGrant,
  TenantProfile,
  Worker,
  WorkerOrganizations,
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

// Turn a failed Response into a human message. FastAPI returns
// {"detail": "..."} (or a list of validation errors) — surfacing the raw JSON
// body in the UI looks broken, so pull out `detail` when present.
export async function errorMessageFromResponse(response: Response, fallback: string): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text) return fallback;
  try {
    const body = JSON.parse(text);
    const detail = body?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const msg = detail.map((d) => d?.msg).filter(Boolean).join("; ");
      if (msg) return msg;
    }
  } catch {
    // Not JSON — fall through to the raw text.
  }
  return text || fallback;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    cache: "no-store",
    headers: await authHeaders(),
  });
  if (!response.ok) {
    throw new Error(await errorMessageFromResponse(response, `GET ${path} failed (${response.status})`));
  }
  return response.json();
}

async function postJson<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(await errorMessageFromResponse(response, `POST ${path} failed (${response.status})`));
  }
  return response.json();
}

async function deleteJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!response.ok) {
    throw new Error(await errorMessageFromResponse(response, `DELETE ${path} failed (${response.status})`));
  }
  return response.json();
}

async function putJson<T>(path: string, body: object): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await errorMessageFromResponse(response, `PUT ${path} failed (${response.status})`));
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
    throw new Error(await errorMessageFromResponse(response, `PATCH ${path} failed (${response.status})`));
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

// ── Platform operator (MULTITENANCY_HANDOFF §5) ──────────────────────────────
type PlatformTenantCreated = { id: string; slug: string; status: string };

export async function invitePlatformTenant(
  payload: Record<string, unknown>,
): Promise<PlatformTenantCreated> {
  return postJson<PlatformTenantCreated>("/api/v1/platform/tenants", payload);
}

export async function platformTenantAction(
  tenantId: string,
  action: "suspend" | "reactivate" | "resend" | "revoke",
): Promise<PlatformTenantCreated> {
  return postJson<PlatformTenantCreated>(`/api/v1/platform/tenants/${tenantId}/${action}`);
}

// ── Platform Settings (PLATFORM_HANDOFF §2) ──────────────────────────────────

export async function invitePlatformOperator(payload: {
  email: string;
  role: string;
  first_name: string;
  last_name: string;
  preferred_language?: string;
}): Promise<PlatformOperator> {
  return postJson<PlatformOperator>("/api/v1/platform/operators", payload);
}

export async function changePlatformOperatorRole(
  operatorId: string,
  role: string,
): Promise<PlatformOperator> {
  return patchJson<PlatformOperator>(`/api/v1/platform/operators/${operatorId}`, { role });
}

export async function removePlatformOperator(operatorId: string): Promise<void> {
  // 204 No Content — don't parse a body.
  const response = await fetch(`${BASE}/api/v1/platform/operators/${operatorId}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!response.ok) {
    throw new Error(await errorMessageFromResponse(response, `Remove failed (${response.status})`));
  }
}

export async function resendPlatformOperatorInvite(operatorId: string): Promise<PlatformOperator> {
  return postJson<PlatformOperator>(`/api/v1/platform/operators/${operatorId}/resend`);
}

export async function updatePlatformSettings(
  partial: Partial<PlatformSettings>,
): Promise<PlatformSettings> {
  return patchJson<PlatformSettings>("/api/v1/platform/settings", partial);
}

// ── Tenant access grants (PLATFORM_HANDOFF §2.2) ─────────────────────────────

export async function requestTenantAccess(
  tenantId: string,
  reason: string,
): Promise<TenantAccessGrant> {
  return postJson<TenantAccessGrant>(
    `/api/v1/platform/tenants/${tenantId}/access-request`,
    { reason },
  );
}

/** Operator ends their own current visit early (single-visit invariant —
 * no id needed, at most one grant is active). */
export async function releaseTenantAccessGrant(): Promise<TenantAccessGrant> {
  return postJson<TenantAccessGrant>(`/api/v1/platform/access-grants/release`);
}

// ── Housekeeping orphan scan ──────────────────────────────────────────────────
export async function scanOrphans(): Promise<OrphanScanResult> {
  return getJson<OrphanScanResult>("/api/v1/platform/housekeeping/orphans");
}

/** Remove one scanned orphan; the backend returns a fresh scan. */
export async function removeOrphan(kind: "clerk" | "db", id: string): Promise<OrphanScanResult> {
  return postJson<OrphanScanResult>("/api/v1/platform/housekeeping/orphans/remove", { kind, id });
}

export async function approveTenantAccessGrant(grantId: string): Promise<TenantAccessGrant> {
  return postJson<TenantAccessGrant>(`/api/v1/tenant/access-grants/${grantId}/approve`);
}

export async function denyTenantAccessGrant(grantId: string): Promise<TenantAccessGrant> {
  return postJson<TenantAccessGrant>(`/api/v1/tenant/access-grants/${grantId}/deny`);
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

export async function patchAdminOrganization(
  organizationId: string,
  partial: Record<string, unknown>,
): Promise<AdminOrganizationSite> {
  return patchJson<AdminOrganizationSite>(`/api/v1/admin/organizations/${organizationId}`, partial);
}

export async function fetchAdminRequestsIndex(
  params: { tab?: string; siteId?: string; urgency?: string; language?: string; cursor?: string } = {},
): Promise<AdminRequestsResponse> {
  const search = new URLSearchParams();
  if (params.tab) search.set("tab", params.tab);
  if (params.siteId) search.set("site_id", params.siteId);
  if (params.urgency && params.urgency !== "all") search.set("urgency", params.urgency);
  if (params.language && params.language !== "all") search.set("language", params.language);
  if (params.cursor) search.set("cursor", params.cursor);
  const qs = search.toString();
  return getJson<AdminRequestsResponse>(`/api/v1/admin/requests${qs ? `?${qs}` : ""}`);
}

export async function assignWorker(
  staffingRequestId: string,
  workerUserId: string,
): Promise<Assignment> {
  return postJson<Assignment>("/api/v1/assignments", {
    staffing_request_id: staffingRequestId,
    worker_user_id: workerUserId,
    notes: "Assigned from requests index",
  });
}

export async function fetchAdminActivity(
  params: { filter?: AdminActivityFilter; cursor?: string; siteId?: string; limit?: number } = {},
): Promise<AdminActivity> {
  const search = new URLSearchParams();
  if (params.filter && params.filter !== "all") search.set("filter", params.filter);
  if (params.cursor) search.set("cursor", params.cursor);
  if (params.siteId) search.set("site_id", params.siteId);
  if (params.limit) search.set("limit", String(params.limit));
  const qs = search.toString();
  return getJson<AdminActivity>(`/api/v1/admin/activity${qs ? `?${qs}` : ""}`);
}

export async function cancelRequest(requestId: string, reason: string): Promise<StaffingRequest> {
  return postJson<StaffingRequest>(`/api/v1/requests/${requestId}/cancel`, { reason });
}

export async function renotifyRequest(requestId: string): Promise<StaffingRequest> {
  return postJson<StaffingRequest>(`/api/v1/requests/${requestId}/renotify`, {});
}

export async function notifyWorkers(
  requestId: string,
  workerUserIds: string[],
): Promise<{ newly_notified: number }> {
  return postJson<{ newly_notified: number }>(`/api/v1/admin/requests/${requestId}/notify`, {
    worker_user_ids: workerUserIds,
  });
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

/** Self-serve replacement (§2): release a held shift to the pool. Returns the
 * new worker_replacement request the pool will claim. */
export async function releaseShift(
  requestId: string,
  reason: "sick" | "family" | "personal" | "other" | null,
): Promise<StaffingRequest> {
  return postJson<StaffingRequest>(`/api/v1/requests/${requestId}/release`, { reason });
}

/** Self-serve replacement (§3): claim an open replacement. Resolves to the new
 * assignment on win; throws (409 already_filled / 403 not eligible) otherwise. */
export async function claimShift(requestId: string): Promise<Assignment> {
  return postJson<Assignment>(`/api/v1/requests/${requestId}/claim`, {});
}

/** Self-serve replacement (§7): the giver cancels their release before a claim. */
export async function cancelRelease(requestId: string): Promise<StaffingRequest> {
  return postJson<StaffingRequest>(`/api/v1/requests/${requestId}/cancel-release`, {});
}

// Permanent-staff absence report (§1).
export async function fetchAbsenceOptions(): Promise<{ sites: AbsenceSite[] }> {
  return getJson<{ sites: AbsenceSite[] }>("/api/v1/requests/report-absence/options");
}

/** The worker's own reported absences + live status (the report-absence hub). */
export async function fetchMyAbsenceReports(): Promise<{ items: MyAbsenceItem[] }> {
  return getJson<{ items: MyAbsenceItem[] }>("/api/v1/requests/report-absence/mine");
}

export async function reportAbsence(payload: {
  organization_id: string;
  role: string;
  work_date: string;
  start_time: string;
  end_time: string;
  reason: string | null;
  note: string | null;
}): Promise<StaffingRequest> {
  return postJson<StaffingRequest>("/api/v1/requests/report-absence", payload);
}

export type ReplacementStatus = {
  request_id: string;
  status: string;
  alerted: number;
  viewed: number;
  filled: boolean;
  claimed_by_name: string | null;
};

/** Live tally + filled state for the giver's waiting screen (§6). */
export async function fetchReplacementStatus(requestId: string): Promise<ReplacementStatus> {
  return getJson<ReplacementStatus>(`/api/v1/requests/${requestId}/replacement-status`);
}

/** For an ORIGINAL request the caller holds, the release already in flight (or
 * null) — so the tracking page shows "waiting for a claim" on reload instead of
 * re-offering release. */
export async function fetchActiveReplacement(requestId: string): Promise<ReplacementStatus | null> {
  return getJson<ReplacementStatus | null>(`/api/v1/requests/${requestId}/active-replacement`);
}

// Per-org self-serve policy (§5) — coordinator settings.
export async function fetchReplacementPolicy(organizationId: string): Promise<ReplacementPolicy> {
  return getJson<ReplacementPolicy>(`/api/v1/admin/replacements/policy?organization_id=${organizationId}`);
}

export async function updateReplacementPolicy(
  organizationId: string,
  partial: { policy?: "auto" | "managed"; allowed_roles?: string[]; min_release_lead_minutes?: number },
): Promise<ReplacementPolicy> {
  return patchJson<ReplacementPolicy>(
    `/api/v1/admin/replacements/policy?organization_id=${organizationId}`,
    partial,
  );
}

/** Housekeeping (§7): expire still-searching releases whose shift already started. */
export async function sweepReplacements(): Promise<{ expired: number }> {
  return postJson<{ expired: number }>("/api/v1/admin/replacements/sweep", {});
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

// Separate endpoint from the preferences above: sms_opt_out lives on the user
// row, not the worker profile, so it returns the Worker and keeps working for
// someone who has no profile yet.
export async function updateWorkerSmsPreference(
  workerId: string,
  smsOptOut: boolean,
): Promise<Worker> {
  return patchJson<Worker>(`/api/v1/workers/${workerId}/sms-preference`, {
    sms_opt_out: smsOptOut,
  });
}

// ── Org selection (worker_organizations opt-in) ──────────────────────────────
// Opt-out model: no selection = the worker is open to every org in their
// tenant; selecting orgs restricts matching + notifications to those only.

export async function fetchWorkerOrganizations(
  workerId: string,
): Promise<WorkerOrganizations> {
  return getJson<WorkerOrganizations>(`/api/v1/workers/${workerId}/organizations`);
}

export async function updateWorkerOrganizations(
  workerId: string,
  organizationIds: string[],
): Promise<WorkerOrganizations> {
  return putJson<WorkerOrganizations>(`/api/v1/workers/${workerId}/organizations`, {
    organization_ids: organizationIds,
  });
}

// ── Web Push (PWA) ───────────────────────────────────────────────────────────

export async function fetchPushPublicKey(): Promise<string> {
  const data = await getJson<{ public_key: string }>("/api/v1/workers/push/public-key");
  return data.public_key;
}

export async function savePushSubscription(
  workerId: string,
  payload: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    user_agent?: string;
  },
): Promise<{ id: string }> {
  return postJson<{ id: string }>(`/api/v1/workers/${workerId}/push/subscribe`, payload);
}

export async function removePushSubscription(
  workerId: string,
  endpoint: string,
): Promise<{ removed: boolean }> {
  return postJson<{ removed: boolean }>(`/api/v1/workers/${workerId}/push/unsubscribe`, { endpoint });
}

export async function inviteWorker(payload: {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  preferred_language?: string;
  employment_type?: "permanent" | "contractor";
}): Promise<Worker> {
  return postJson<Worker>("/api/v1/workers/invite", payload);
}

export async function removeUser(userId: string): Promise<{ id: string; is_active: boolean }> {
  return deleteJson<{ id: string; is_active: boolean }>(`/api/v1/users/${userId}`);
}

export async function removeOrganization(
  organizationId: string,
): Promise<{ id: string; is_active: boolean }> {
  return deleteJson<{ id: string; is_active: boolean }>(`/api/v1/organizations/${organizationId}`);
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

// ── Tenant onboarding wizard (MULTITENANCY_HANDOFF §6) ───────────────────────
export async function fetchTenantProfile(): Promise<TenantProfile> {
  return getJson<TenantProfile>("/api/v1/tenant/profile");
}

export async function patchTenantProfile(payload: Record<string, unknown>): Promise<TenantProfile> {
  return patchJson<TenantProfile>("/api/v1/tenant/profile", payload);
}

export async function completeTenantOnboarding(): Promise<TenantProfile> {
  return postJson<TenantProfile>("/api/v1/tenant/onboarding/complete");
}

export async function createOrganization(payload: {
  name: string;
  type: string;
  city: string;
  region?: string;
  contact_email?: string;
  contact_phone?: string;
  preferred_language: string;
  address_line1?: string | null;
  address_line2?: string | null;
  postal_code?: string | null;
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

export async function checkOutAssignment(
  assignmentId: string,
  coords?: { latitude: number; longitude: number },
): Promise<Assignment> {
  return postJson<Assignment>(`/api/v1/assignments/${assignmentId}/check-out`, coords ?? {});
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
