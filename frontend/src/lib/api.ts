import { auth } from "@clerk/nextjs/server";
import {
  Assignment,
  NetworkSummary,
  Organization,
  RequestResponse,
  StaffingRequest,
  User,
  Worker,
} from "./types";

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
