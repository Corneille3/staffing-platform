export type Tenant = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
};

export type NetworkSummary = {
  organization_count: number;
  request_count: number;
  assignment_count: number;
};

export type NetworkOverview = {
  total_requests: number;
  filled_count: number;
  fill_rate: number;
  active_substitutes: number;
  unfilled_count: number;
  avg_fill_hours: number | null;
  status_breakdown: Record<string, number>;
  shortage_cities: string[];
};

export type ApfSnapshotKpis = {
  total_requests: number;
  filled_count: number;
  fill_rate: number;
  active_substitutes: number;
  unfilled_count: number;
  avg_fill_hours: number | null;
  organizations_count: number;
};

export type OrgActivityRow = {
  id: string;
  name: string;
  city: string;
  region: string | null;
  type: string;
  total: number;
  filled: number;
  open: number;
};

export type RecentClosedRequestRow = {
  id: string;
  title: string;
  status: string;
  city: string;
  work_date: string;
  organization_id: string;
  organization_name: string | null;
};

export type ApfSnapshot = {
  kpis: ApfSnapshotKpis;
  status_breakdown: Record<string, number>;
  shortage_cities: string[];
  org_activity: OrgActivityRow[];
  recent_closed_requests: RecentClosedRequestRow[];
};

export type ApfActivityFilter =
  | "all"
  | "assigned"
  | "cancelled"
  | "escalated"
  | "invitations"
  | "removals";

export type ApfActivityActor = {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
};

export type ApfActivityOrganization = {
  id: string;
  name: string;
};

export type ApfActivityRow = {
  id: string;
  created_at: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor: ApfActivityActor | null;
  organization: ApfActivityOrganization | null;
  payload: Record<string, unknown>;
  request_title: string | null;
};

export type ApfActivityCounts = {
  all: number;
  assigned: number;
  cancelled: number;
  escalated: number;
  invitations: number;
  removals: number;
};

export type ApfActivity = {
  items: ApfActivityRow[];
  next_cursor: string | null;
  counts: ApfActivityCounts;
};

export type NetworkPoolKpis = {
  total: number;
  available_now: number;
  multi_org_pct: number;
  avg_reliability: number;
  shortage_cities_count: number;
};

export type CityDistributionRow = {
  city: string;
  total: number;
  available: number;
  coverage_pct: number;
  languages: string[];
};

export type ContributorRow = {
  id: string;
  first_name: string;
  last_name: string;
  cities: string[];
  role: string;
  org_count: number;
  shifts_30d: number;
  languages: string[];
  reliability: number;
};

export type NetworkPool = {
  kpis: NetworkPoolKpis;
  distribution: CityDistributionRow[];
  top_contributors: ContributorRow[];
};

export type BulkInviteEntry = {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  preferred_language?: string;
};

export type BulkInviteOutcome = {
  email: string;
  status: "invited" | "skipped";
  reason: string | null;
  user_id: string | null;
};

export type BulkInviteResult = {
  invited_count: number;
  skipped_count: number;
  outcomes: BulkInviteOutcome[];
};

export type OrgSnapshotKpis = {
  total_requests: number;
  filled_count: number;
  fill_rate: number;
  unfilled_count: number;
  avg_fill_hours: number | null;
  active_substitutes_in_city: number;
};

export type OrgRequestRow = {
  id: string;
  title: string;
  status: string;
  city: string;
  work_date: string;
  created_at: string;
};

export type OrgSnapshot = {
  id: string;
  name: string;
  type: string;
  city: string;
  region: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  preferred_language: string;
  is_active: boolean;
  kpis: OrgSnapshotKpis;
  status_breakdown: Record<string, number>;
  recent_closed_requests: OrgRequestRow[];
  upcoming_open_requests: OrgRequestRow[];
};

export type ApfExportRequest = {
  date_from: string; // YYYY-MM-DD
  date_to: string;
  org_ids?: string[];
  format?: "csv";
};

export type ApfExportJob = {
  id: string;
  status: "pending" | "ready" | "failed";
  created_at: string;
  completed_at: string | null;
  row_count: number | null;
  download_url: string | null;
  error: string | null;
};

export type AdminSubstituteRow = {
  worker: Worker;
  match_score: number | null;
  eligible: boolean | null;
  /** Eligible AND passes the notification-preference gate — would receive the publish broadcast. */
  would_notify: boolean | null;
  reasons: EligibilityReason[];
};

export type RankAgainstBrief = {
  id: string;
  title: string;
  city: string;
  work_date: string;
  language_requirement: string | null;
  required_qualifications: string[];
  required_certifications: string[];
};

export type AdminSubstitutesResponse = {
  items: AdminSubstituteRow[];
  rank_against: RankAgainstBrief | null;
};

export type AdminRequestMetrics = {
  notified: number;
  viewed: number;
  accepted: number;
  declined: number;
  responses: number;
};

export type AdminRequestTopMatch = {
  user_id: string;
  name: string;
  match_score: number | null;
};

export type AdminRequestAssignedWorker = {
  user_id: string;
  name: string;
};

export type AdminRequestSummary = {
  id: string;
  public_id: string;
  urgent: boolean;
  status: string;
  role: string | null;
  title: string;
  organization_id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  language_requirement: string | null;
  required_qualifications: string[];
  urgency_level: number;
  created_at: string;
  metrics: AdminRequestMetrics;
  top_match: AdminRequestTopMatch | null;
  assigned_worker: AdminRequestAssignedWorker | null;
};

export type AdminRequestCounts = { active: number; assigned: number; all: number };

export type AdminRequestsResponse = {
  items: AdminRequestSummary[];
  counts: AdminRequestCounts;
  next_cursor: string | null;
};

export type AdminRequestTab = "active" | "assigned" | "all";

export type AdminDashboardKpis = {
  fill_rate_week: number;
  fill_rate_delta: number;
  avg_time_to_fill_minutes: number | null;
  open_count: number;
  assigned_count: number;
  substitutes_ready: number;
};

export type AdminRosterEntry = {
  name: string;
  role: string | null;
  starts_at: string;
  ends_at: string;
  status: "on_site" | "arriving" | "en_route";
};

export type AdminDashboardUrgent = AdminRequestSummary & {
  elapsed: string;
  starts_in: string;
};

export type AdminDashboard = {
  coordinator: { first_name: string };
  urgent_now: AdminDashboardUrgent | null;
  kpis: AdminDashboardKpis;
  live_requests: AdminRequestSummary[];
  activity_today: ApfActivityRow[];
  week_fill_rate: number[];
  roster_today: AdminRosterEntry[];
};

export type AdminActivityFilter =
  | "all"
  | "posted"
  | "accepted"
  | "declined"
  | "assigned"
  | "completed"
  | "cancelled"
  | "expired"
  | "invited";

export type AdminActivityCounts = {
  all: number;
  posted: number;
  accepted: number;
  declined: number;
  assigned: number;
  completed: number;
  cancelled: number;
  expired: number;
  invited: number;
};

export type AdminActivityKpis = {
  posted: number;
  filled: number;
  cancelled: number;
  expired: number;
  fill_rate: number;
  avg_time_to_fill_minutes: number | null;
  sites: number;
};

export type AdminActivity = {
  items: ApfActivityRow[];
  next_cursor: string | null;
  counts: AdminActivityCounts;
  kpis: AdminActivityKpis;
};

export type AdminOrgMetrics = {
  fill_rate_30d: number;
  requests_30d: number;
  filled_30d: number;
  open_requests: number;
};

export type AdminOrgCoordinator = {
  id: string;
  name: string;
  role: string;
};

export type AdminOrgRosterToday = {
  on_site: number;
  substitutes_arriving: number;
};

export type AdminOrganizationSite = {
  id: string;
  parent_organization_id: string | null;
  name: string;
  type: string;
  city: string;
  neighbourhood: string | null;
  region: string | null;
  address_line1: string | null;
  postal_code: string | null;
  capacity: number | null;
  enrolled_count: number | null;
  hours_label: string | null;
  preferred_language: string;
  contact_phone: string | null;
  contact_email: string | null;
  is_active: boolean;
  metrics: AdminOrgMetrics;
  coordinators: AdminOrgCoordinator[];
  roster_today: AdminOrgRosterToday;
};

export type Organization = {
  id: string;
  name: string;
  type: string;
  city: string;
  neighbourhood: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  contact_email: string | null;
  contact_phone: string | null;
  preferred_language: string;
  is_active: boolean;
};

export type RequestRole =
  | "educator"
  | "assistant_educator"
  | "psw"
  | "nurse"
  | "food_handler"
  | "other";

export type SlotPeriod = "morning" | "afternoon" | "evening" | "overnight";

export type Availability = {
  id: string;
  user_id: string;
  day_of_week: number | null;
  specific_date: string | null;
  slot: SlotPeriod;
  available: boolean;
  created_at: string;
};

export type AvailabilityCell = {
  id: string;
  specific_date: string;
  slot: SlotPeriod;
  available: boolean;
};

export type AvailabilityGrid = {
  week_start: string;
  cells: AvailabilityCell[];
};

export type WorkerProfile = {
  availability_status: string;
  urgent_alert_opt_in: boolean;
  notify_far: boolean;
  notify_weekend_overnight: boolean;
  travel_radius_km: number | null;
  home_latitude: string | null;
  home_longitude: string | null;
  supported_cities: string[];
  qualifications: string[];
  certifications: string[];
};

export type Worker = {
  id: string;
  clerk_user_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  preferred_language: string;
  is_active: boolean;
  profile: WorkerProfile | null;
};

export type OrganizationSummary = {
  id: string;
  name: string;
  type: string;
  city: string;
  neighbourhood: string | null;
  // Pydantic Decimal serializes as a string over JSON
  latitude: string | null;
  longitude: string | null;
};

export type StaffingRequest = {
  id: string;
  organization_id: string;
  organization: OrganizationSummary | null;
  created_by_user_id: string;
  request_type: string;
  role: RequestRole | null;
  title: string;
  description: string | null;
  city: string;
  location_name: string | null;
  work_date: string;
  start_time: string;
  end_time: string;
  status: string;
  origin?: "coordinator" | "worker_replacement" | "staff_absence";
  auto_assign?: boolean;
  replaces_assignment_id?: string | null;
  release_reason?: string | null;
  urgency_level: number;
  language_requirement: string | null;
  coverage_type: "same_day_urgent" | "planned_absence" | "recurring" | "emergency" | null;
  hourly_rate: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  arrival_instructions: string | null;
  required_qualifications: string[];
  required_certifications?: string[];
  assigned_worker_user_id: string | null;
  assigned_at?: string | null;
  cancelled_at?: string | null;
  completed_at?: string | null;
  content_last_edited_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type EligibilityReason = {
  type: "profile" | "availability" | "city" | "language" | "qualification" | "certification";
  status: "matched" | "missing";
  label: string;
  code: string | null;
};

export type EligibilityResult = {
  score: number;
  eligible: boolean;
  reasons: EligibilityReason[];
};

export type User = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  preferred_language: string;
};

export type RequestResponse = {
  id: string;
  staffing_request_id: string;
  worker_user_id: string;
  status: string;
  decline_reason: string | null;
  viewed_at: string | null;
  last_reviewed_at: string | null;
  responded_at: string | null;
};

export type NotificationFeedItem = {
  id: string;
  type: "new_request" | "urgent" | "assigned" | "not_selected" | "cancelled";
  staffing_request_id: string;
  request_title: string;
  request_city: string;
  request_date: string;
  created_at: string;
};

export type AuditLog = {
  id: string;
  actor_user_id: string;
  organization_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type Coordinator = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  preferred_language: string;
  is_active: boolean;
  organizations: Organization[];
};

export type Assignment = {
  id: string;
  staffing_request_id: string;
  worker_user_id: string;
  assigned_by_user_id: string;
  status: string;
  assigned_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  checked_in_at: string | null;
  checked_in_latitude: string | null;
  checked_in_longitude: string | null;
  notes: string | null;
};

// ── Platform operator tier (MULTITENANCY_HANDOFF §5) ──────────────────────────
export type PlatformKpis = {
  active_tenants: number;
  total_orgs: number;
  total_substitutes: number;
  weighted_fill_rate: number | null;
};

export type PlatformTenantRow = {
  id: string;
  name: string;
  slug: string;
  region: string | null;
  status: "pending" | "onboarding" | "active" | "suspended" | string;
  org_count: number;
  substitute_count: number;
  fill_rate_30d: number | null;
  admin_name: string | null;
  admin_email: string | null;
  since: string | null;
};

export type PlatformTenantsResponse = {
  kpis: PlatformKpis;
  tenants: PlatformTenantRow[];
};

// ── Platform Settings (PLATFORM_HANDOFF §2) ───────────────────────────────────
export type PlatformOperatorRole = "owner" | "operator" | "support";

export type PlatformOperator = {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: PlatformOperatorRole | string;
  mfa_enabled: boolean;
  status: "pending" | "active" | string;
  invited_at: string | null;
  last_active_at: string | null;
};

export type PlatformOperatorsResponse = {
  operators: PlatformOperator[];
  viewer_role: PlatformOperatorRole | string | null;
};

export type PlatformSettings = {
  default_language: string;
  trial_length_days: number;
  invite_expiry_days: number;
  data_residency: string; // locked (Law 25)
  orphan_retention_days: number;
  access_requires_approval: boolean;
  access_window_hours: number;
  reserved_slugs: string[];
};

// ── Tenant access grants (PLATFORM_HANDOFF §2.2) ──────────────────────────────
export type TenantAccessGrant = {
  id: string;
  tenant_id: string;
  tenant_name: string;
  operator_user_id: string;
  operator_name: string;
  operator_email: string;
  reason: string;
  status: "requested" | "approved" | "active" | "expired" | "denied" | string;
  requested_at: string | null;
  expires_at: string | null;
};

export type TenantAccessGrantsResponse = {
  grants: TenantAccessGrant[];
  active_count: number;
};

// ── Housekeeping orphan scan ──────────────────────────────────────────────────
export type OrphanAccount = {
  /** "clerk" → id is the Clerk user id (no DB row). "db" → id is users.id. */
  kind: "clerk" | "db";
  id: string;
  email: string | null;
  name: string | null;
  role: string | null; // db kind only
  created_at: string | null;
  last_sign_in_at: string | null; // clerk kind only
  clerk_linked: boolean | null; // db kind only
};

export type OrphanScanResult = {
  clerk_only: OrphanAccount[];
  db_only: OrphanAccount[];
  /** False when the Clerk Backend API is unreachable — clerk_only is then unknown, not empty. */
  clerk_available: boolean;
  scanned_at: string;
};

export type TenantProfile = {
  id: string;
  name: string;
  slug: string;
  region: string | null;
  status: "pending" | "onboarding" | "active" | "suspended" | string;
  preferred_language: string;
  /** True when the caller sees this tenant via an active access grant
   * (read-only visit) rather than a membership. */
  via_grant?: boolean;
};
