from enum import Enum

from sqlalchemy import Enum as SAEnum


class UserRole(str, Enum):
    APF_ADMIN = 'apf_admin'
    ORG_ADMIN = 'org_admin'
    WORKER = 'worker'


class OrganizationType(str, Enum):
    FAMILY_DAYCARE = 'family_daycare'
    SCHOOL_BASED_SERVICE = 'school_based_service'
    COMMUNITY_CENTRE = 'community_centre'


class RequestType(str, Enum):
    URGENT_REPLACEMENT = 'urgent_replacement'
    PLANNED_REPLACEMENT = 'planned_replacement'
    OPEN_STAFFING_NEED = 'open_staffing_need'


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
