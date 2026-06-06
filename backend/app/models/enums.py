from enum import Enum

from sqlalchemy import Enum as SAEnum


class UserRole(str, Enum):
    PLATFORM_ADMIN = 'platform_admin'
    NETWORK_ADMIN = 'network_admin'
    ORG_ADMIN = 'org_admin'
    WORKER = 'worker'


class TenantStatus(str, Enum):
    """Tenant lifecycle (MULTITENANCY_HANDOFF §4)."""
    PENDING = 'pending'        # operator invited; no one has signed up yet
    ONBOARDING = 'onboarding'  # first admin signed up, running the wizard
    ACTIVE = 'active'          # workspace live
    SUSPENDED = 'suspended'    # operator paused; data preserved


class PlatformOperatorRole(str, Enum):
    """Tier-0 operator roles (PLATFORM_HANDOFF §1). Layered on top of
    UserRole.PLATFORM_ADMIN (which gates access to the /platform surface)."""
    OWNER = 'owner'        # everything: operators, billing, tenants, access
    OPERATOR = 'operator'  # invite/suspend tenants + request access; no operator/billing edits
    SUPPORT = 'support'    # read-only; can request tenant access only


class TenantAccessGrantStatus(str, Enum):
    """Lifecycle of a logged, consented, time-boxed look inside a tenant
    (PLATFORM_HANDOFF §2.2)."""
    REQUESTED = 'requested'  # operator asked; waiting on the tenant admin
    APPROVED = 'approved'    # consent given (transitional; activation sets ACTIVE)
    ACTIVE = 'active'        # read-only access live until expires_at
    EXPIRED = 'expired'      # window closed (auto)
    DENIED = 'denied'        # tenant admin said no


class OrganizationType(str, Enum):
    CHILDCARE = 'childcare'
    LONG_TERM_CARE = 'long_term_care'
    COMMUNITY_CARE = 'community_care'
    HOME_CARE = 'home_care'
    ASSISTED_LIVING = 'assisted_living'
    OTHER = 'other'


class RequestType(str, Enum):
    URGENT_REPLACEMENT = 'urgent_replacement'
    PLANNED_REPLACEMENT = 'planned_replacement'
    OPEN_STAFFING_NEED = 'open_staffing_need'


class RequestRole(str, Enum):
    EDUCATOR = 'educator'
    ASSISTANT_EDUCATOR = 'assistant_educator'
    PSW = 'psw'
    NURSE = 'nurse'
    FOOD_HANDLER = 'food_handler'
    OTHER = 'other'


class SlotPeriod(str, Enum):
    MORNING = 'morning'        # 06–12
    AFTERNOON = 'afternoon'    # 12–18
    EVENING = 'evening'        # 18–24
    OVERNIGHT = 'overnight'    # 00–06


class CoverageType(str, Enum):
    SAME_DAY_URGENT = 'same_day_urgent'
    PLANNED_ABSENCE = 'planned_absence'
    RECURRING = 'recurring'
    EMERGENCY = 'emergency'


class RequestStatus(str, Enum):
    DRAFT = 'draft'
    OPEN = 'open'
    NOTIFIED = 'notified'
    RESPONSES_RECEIVED = 'responses_received'
    ASSIGNED = 'assigned'
    COMPLETED = 'completed'
    CANCELLED = 'cancelled'
    EXPIRED = 'expired'


class ResponseStatus(str, Enum):
    NOTIFIED = 'notified'
    VIEWED = 'viewed'
    ACCEPTED = 'accepted'
    DECLINED = 'declined'
    WITHDRAWN = 'withdrawn'
    NO_RESPONSE = 'no_response'


class AssignmentStatus(str, Enum):
    PENDING_CONFIRMATION = 'pending_confirmation'
    CONFIRMED = 'confirmed'
    CANCELLED = 'cancelled'
    COMPLETED = 'completed'


class AvailabilityStatus(str, Enum):
    AVAILABLE = 'available'
    UNAVAILABLE = 'unavailable'


class NotificationChannel(str, Enum):
    EMAIL = 'email'
    IN_APP = 'in_app'
    SMS = 'sms'


class RequestRequirementType(str, Enum):
    QUALIFICATION = 'qualification'
    CERTIFICATION = 'certification'


def db_enum(enum_cls: type[Enum], name: str) -> SAEnum:
    return SAEnum(enum_cls, name=name, values_callable=lambda members: [member.value for member in members])
