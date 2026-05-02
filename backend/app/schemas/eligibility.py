from typing import Literal

from pydantic import BaseModel


EligibilityReasonType = Literal[
    'profile',
    'availability',
    'city',
    'language',
    'qualification',
    'certification',
]
EligibilityReasonStatus = Literal['matched', 'missing']


class EligibilityReason(BaseModel):
    type: EligibilityReasonType
    status: EligibilityReasonStatus
    label: str
    code: str | None = None


class EligibilityResult(BaseModel):
    eligible: bool
    reasons: list[EligibilityReason]
