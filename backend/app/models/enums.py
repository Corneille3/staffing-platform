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
    REMOVED = 'removed'        # soft-deleted; hidden from the console, history kept


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
    # Self-serve replacement, approval mode: a released shift waits for the
    # coordinator to approve before it broadcasts (SELF_SERVE_REPLACEMENT §5).
    PENDING_APPROVAL = 'pending_approval'


class RequestOrigin(str, Enum):
    """How a request was created (SELF_SERVE_REPLACEMENT §1). Default keeps
    every existing coordinator-created request unchanged."""
    COORDINATOR = 'coordinator'
    WORKER_REPLACEMENT = 'worker_replacement'  # contractor released a held shift
    STAFF_ABSENCE = 'staff_absence'            # permanent staff reported an absence


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
    # The holder gave the shift up via self-serve replacement and someone else
    # claimed it. Distinct from CANCELLED (coordinator-initiated) for audit.
    RELEASED = 'released'


class EmploymentType(str, Enum):
    """A worker's relationship to a tenant, set by the tenant admin at invite
    (SELF_SERVE_REPLACEMENT §1). On-call folds into contractor. Drives which
    self-serve trigger the worker sees (report vs release)."""
    PERMANENT = 'permanent'
    CONTRACTOR = 'contractor'


class ReplacementPolicy(str, Enum):
    """Per-org self-serve policy (SELF_SERVE_REPLACEMENT §5, adapted).

    AUTO    — released shift broadcasts instantly, first-claim wins (no coordinator).
    MANAGED — released shift broadcasts too, but workers accept/decline and the
              coordinator picks who to assign (the existing dispatch flow)."""
    AUTO = 'auto'
    MANAGED = 'managed'


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
