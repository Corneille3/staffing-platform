import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  Assignment,
  AuditLog,
  Coordinator,
  NetworkOverview,
  NetworkSummary,
  Organization,
  RequestResponse,
  StaffingRequest,
  User,
  Worker,
} from "./types";

export type ServerSession = {
  id: string;
  email: string;
  role: "worker" | "org_admin" | "network_admin" | "platform_admin";
  first_name: string;
  last_name: string;
  clerk_user_id: string | null;
  preferred_language: string;
};

const ROLE_HOME_BY_ROLE: Record<ServerSession["role"], string> = {
  worker: "/worker",
  org_admin: "/admin",
  network_admin: "/apf",
  platform_admin: "/apf",
};

const apiBaseUrl =
  process.env.API_BASE_URL ||
  process.env.INTERNAL_API_BASE_URL ||
  "http://backend:8000";

const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

async function authHeaders(): Promise<Record<string, string>> {
  if (!CLERK_ENABLED) return {};
  try {
    const session = await auth();
    const token = await session.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    cache: "no-store",
    headers: await authHeaders(),
  });

  if (!response.ok) {
    throw new Error(`API request failed for ${path} with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Server-side: ensure the signed-in Clerk user is linked to a DB user, then
 * return the DB user. Used at the top of role-shell layouts so that:
 *   - the user is linked before any data fetches run (avoids 401/403 on
 *     fresh sign-ups, where /auth/sync hadn't been called yet);
 *   - role-based redirects can happen server-side (avoids the
 *     "wrong-role user lands on /apf and SSR crashes" bug).
 *
 * Behavior:
 *   - Not signed in (no Clerk session)        → redirect to /sign-in
 *   - Signed in but no DB row (status 403)    → redirect to /not-invited
 *   - allowedRoles given and role mismatched  → redirect to ROLE_HOME[role]
 *   - Otherwise                                → returns the DB user
 *
 * Each call POSTs to /auth/sync, which is idempotent (writes only on first
 * link). Safe to call from every layout render.
 */
export async function requireServerSession(
  allowedRoles?: ReadonlyArray<ServerSession["role"]>,
): Promise<ServerSession> {
  if (!CLERK_ENABLED) {
    throw new Error("requireServerSession requires Clerk to be configured");
  }

  const session = await auth();
  const token = await session.getToken();
  if (!token) {
    redirect("/sign-in");
  }

  const response = await fetch(`${apiBaseUrl}/api/v1/auth/sync`, {
    method: "POST",
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 403) {
    redirect("/not-invited");
  }
  if (!response.ok) {
    throw new Error(`auth/sync failed with status ${response.status}`);
  }

  const user = (await response.json()) as ServerSession;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    redirect(ROLE_HOME_BY_ROLE[user.role] ?? "/");
  }

  return user;
}

export async function getDashboardData(): Promise<{
  summary: NetworkSummary;
  organizations: Organization[];
  workers: Worker[];
  requests: StaffingRequest[];
}> {
  const [summaryResponse, organizationsResponse, workersResponse, requestsResponse] =
    await Promise.all([
      fetchJson<{ summary: NetworkSummary }>("/api/v1/reports/network-summary"),
      fetchJson<{ items: Organization[] }>("/api/v1/organizations"),
      fetchJson<{ items: Worker[] }>("/api/v1/workers"),
      fetchJson<{ items: StaffingRequest[] }>("/api/v1/requests"),
    ]);

  return {
    summary: summaryResponse.summary,
    organizations: organizationsResponse.items,
    workers: workersResponse.items,
    requests: requestsResponse.items,
  };
}

export async function getOrganizations(): Promise<Organization[]> {
  const response = await fetchJson<{ items: Organization[] }>("/api/v1/organizations");
  return response.items;
}

export async function getWorkers(): Promise<Worker[]> {
  const response = await fetchJson<{ items: Worker[] }>("/api/v1/workers");
  return response.items;
}

export async function getUsers(): Promise<User[]> {
  const response = await fetchJson<{ items: User[] }>("/api/v1/users");
  return response.items;
}

export async function getRequests(): Promise<StaffingRequest[]> {
  const response = await fetchJson<{ items: StaffingRequest[] }>("/api/v1/requests");
  return response.items;
}

export async function getRequest(requestId: string): Promise<StaffingRequest> {
  return fetchJson<StaffingRequest>(`/api/v1/requests/${requestId}`);
}

export async function getRequestResponses(requestId: string): Promise<RequestResponse[]> {
  const response = await fetchJson<{ items: RequestResponse[] }>(
    `/api/v1/requests/${requestId}/responses`,
  );
  return response.items;
}

export async function getAssignments(): Promise<Assignment[]> {
  const response = await fetchJson<{ items: Assignment[] }>("/api/v1/assignments");
  return response.items;
}

export async function getNetworkOverview(): Promise<NetworkOverview> {
  return fetchJson<NetworkOverview>("/api/v1/reports/network-overview");
}

export async function getAuditLogs(): Promise<AuditLog[]> {
  const response = await fetchJson<{ items: AuditLog[] }>("/api/v1/audit-logs");
  return response.items;
}

export async function getCoordinators(): Promise<Coordinator[]> {
  const response = await fetchJson<{ items: Coordinator[] }>("/api/v1/coordinators");
  return response.items;
}
