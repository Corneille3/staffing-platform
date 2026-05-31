-- APF Staffing Platform
-- Initial database schema draft extracted from repository planning notes.

-- Core enums

CREATE TYPE user_role AS ENUM ('apf_admin', 'org_admin', 'worker');
CREATE TYPE organization_type AS ENUM ('childcare', 'long_term_care', 'community_care', 'home_care', 'assisted_living', 'other');
CREATE TYPE request_type AS ENUM ('urgent_replacement', 'planned_replacement', 'open_staffing_need');
CREATE TYPE request_status AS ENUM ('draft', 'open', 'notified', 'responses_received', 'assigned', 'completed', 'cancelled', 'expired');
CREATE TYPE response_status AS ENUM ('notified', 'viewed', 'accepted', 'declined', 'withdrawn', 'no_response');
CREATE TYPE assignment_status AS ENUM ('pending_confirmation', 'confirmed', 'cancelled', 'completed');
CREATE TYPE availability_status AS ENUM ('available', 'unavailable');
CREATE TYPE notification_channel AS ENUM ('email', 'in_app', 'sms');
CREATE TYPE request_requirement_type AS ENUM ('qualification', 'certification');
CREATE TYPE coverage_type AS ENUM ('same_day_urgent', 'planned_absence', 'recurring', 'emergency');

-- Tables

CREATE TABLE organizations (
    id UUID PRIMARY KEY,
    parent_organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    type organization_type NOT NULL,
    city VARCHAR(100) NOT NULL,
    region VARCHAR(100),
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    postal_code VARCHAR(20),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    preferred_language VARCHAR(20) NOT NULL DEFAULT 'fr',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    capacity INTEGER,
    enrolled_count INTEGER,
    hours_label VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id UUID PRIMARY KEY,
    clerk_user_id VARCHAR(255) UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    role user_role NOT NULL,
    preferred_language VARCHAR(20) NOT NULL DEFAULT 'fr',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE organization_memberships (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role user_role NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, organization_id)
);

CREATE TABLE worker_profiles (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    availability_status availability_status NOT NULL DEFAULT 'available',
    urgent_alert_opt_in BOOLEAN NOT NULL DEFAULT TRUE,
    travel_radius_km INTEGER,
    notes TEXT,
    reliability INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE worker_regions (
    id UUID PRIMARY KEY,
    worker_profile_id UUID NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
    city VARCHAR(100) NOT NULL,
    region VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (worker_profile_id, city, region)
);

CREATE TABLE worker_qualifications (
    id UUID PRIMARY KEY,
    worker_profile_id UUID NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
    qualification_code VARCHAR(100) NOT NULL,
    qualification_label VARCHAR(255),
    expires_at DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (worker_profile_id, qualification_code)
);

CREATE TABLE worker_certifications (
    id UUID PRIMARY KEY,
    worker_profile_id UUID NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
    certification_code VARCHAR(100) NOT NULL,
    certification_label VARCHAR(255),
    expires_at DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (worker_profile_id, certification_code)
);

CREATE TABLE staffing_requests (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    request_type request_type NOT NULL,
    status request_status NOT NULL DEFAULT 'draft',
    title VARCHAR(255) NOT NULL,
    description TEXT,
    city VARCHAR(100) NOT NULL,
    location_name VARCHAR(255),
    work_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    urgency_level INTEGER NOT NULL DEFAULT 1,
    language_requirement VARCHAR(20) DEFAULT 'fr',
    coverage_type coverage_type,
    contact_name VARCHAR(255),
    contact_phone VARCHAR(50),
    contact_email VARCHAR(255),
    arrival_instructions TEXT,
    assigned_worker_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE request_requirements (
    id UUID PRIMARY KEY,
    staffing_request_id UUID NOT NULL REFERENCES staffing_requests(id) ON DELETE CASCADE,
    requirement_type request_requirement_type NOT NULL,
    requirement_code VARCHAR(100) NOT NULL,
    requirement_label VARCHAR(255),
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (staffing_request_id, requirement_type, requirement_code)
);

CREATE TABLE request_notifications (
    id UUID PRIMARY KEY,
    staffing_request_id UUID NOT NULL REFERENCES staffing_requests(id) ON DELETE CASCADE,
    worker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel notification_channel NOT NULL,
    delivery_status VARCHAR(50) NOT NULL DEFAULT 'queued',
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE request_responses (
    id UUID PRIMARY KEY,
    staffing_request_id UUID NOT NULL REFERENCES staffing_requests(id) ON DELETE CASCADE,
    worker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status response_status NOT NULL,
    decline_reason VARCHAR(255),
    viewed_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (staffing_request_id, worker_user_id)
);

CREATE TABLE assignments (
    id UUID PRIMARY KEY,
    staffing_request_id UUID NOT NULL UNIQUE REFERENCES staffing_requests(id) ON DELETE CASCADE,
    worker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assigned_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status assignment_status NOT NULL DEFAULT 'pending_confirmation',
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    notes TEXT
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID,
    action VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- First migration order
-- 1. enums
-- 2. organizations
-- 3. users
-- 4. organization_memberships
-- 5. worker_profiles
-- 6. worker_regions / worker_qualifications / worker_certifications
-- 7. staffing_requests
-- 8. request_requirements
-- 9. request_notifications
-- 10. request_responses
-- 11. assignments
-- 12. audit_logs
-- 13. indexes

-- Early indexes

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_org_memberships_org_id ON organization_memberships(organization_id);
CREATE INDEX idx_worker_profiles_availability ON worker_profiles(availability_status);
CREATE INDEX idx_worker_regions_city_region ON worker_regions(city, region);
CREATE INDEX idx_worker_qualifications_code ON worker_qualifications(qualification_code);
CREATE INDEX idx_worker_certifications_code ON worker_certifications(certification_code);
CREATE INDEX idx_staffing_requests_org_id ON staffing_requests(organization_id);
CREATE INDEX idx_staffing_requests_status ON staffing_requests(status);
CREATE INDEX idx_staffing_requests_work_date ON staffing_requests(work_date);
CREATE INDEX idx_request_requirements_request_id ON request_requirements(staffing_request_id);
CREATE INDEX idx_request_requirements_type_code ON request_requirements(requirement_type, requirement_code);
CREATE INDEX idx_request_responses_request_id ON request_responses(staffing_request_id);
CREATE INDEX idx_request_notifications_request_id ON request_notifications(staffing_request_id);
CREATE INDEX idx_audit_logs_org_created_at ON audit_logs(organization_id, created_at DESC);
