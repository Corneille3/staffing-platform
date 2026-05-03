export type NetworkSummary = {
  organization_count: number;
  request_count: number;
  assignment_count: number;
};

export type Organization = {
  id: string;
  name: string;
  type: string;
  city: string;
  region: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  preferred_language: string;
  is_active: boolean;
};

export type WorkerProfile = {
  availability_status: string;
  urgent_alert_opt_in: boolean;
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

export type StaffingRequest = {
  id: string;
  organization_id: string;
  created_by_user_id: string;
  request_type: string;
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
  notes: string | null;
};
