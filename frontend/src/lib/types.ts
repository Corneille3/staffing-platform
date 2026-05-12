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
