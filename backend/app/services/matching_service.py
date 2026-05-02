from typing import Literal

from app.models.staffing_request import StaffingRequest
from app.models.user import User
from app.schemas.eligibility import EligibilityReason, EligibilityResult


class MatchingService:
    def eligible_workers(self, staffing_request: StaffingRequest, workers: list[User]) -> list[User]:
        eligible: list[User] = []
        for worker in workers:
            result = self.eligibility_result(staffing_request, worker)
            if result.eligible:
                eligible.append(worker)

        return eligible

    def eligibility_result(self, staffing_request: StaffingRequest, worker: User) -> EligibilityResult:
        reasons: list[EligibilityReason] = []
        profile = worker.worker_profile

        if not worker.is_active:
            reasons.append(
                EligibilityReason(
                    type='profile',
                    status='missing',
                    label='Missing: active worker profile',
                )
            )
            return EligibilityResult(eligible=False, reasons=reasons)

        if profile is None:
            reasons.append(
                EligibilityReason(
                    type='profile',
                    status='missing',
                    label='Missing: worker profile',
                )
            )
            return EligibilityResult(eligible=False, reasons=reasons)

        if profile.availability_status.value == 'available':
            reasons.append(EligibilityReason(type='availability', status='matched', label='Available'))
        else:
            reasons.append(
                EligibilityReason(
                    type='availability',
                    status='missing',
                    label='Missing: availability',
                    code=profile.availability_status.value,
                )
            )

        if staffing_request.city in (profile.supported_cities or []):
            reasons.append(
                EligibilityReason(
                    type='city',
                    status='matched',
                    label='City match',
                    code=staffing_request.city,
                )
            )
        else:
            reasons.append(
                EligibilityReason(
                    type='city',
                    status='missing',
                    label=f'Missing: {staffing_request.city}',
                    code=staffing_request.city,
                )
            )

        language_requirement = staffing_request.language_requirement
        if not language_requirement:
            reasons.append(EligibilityReason(type='language', status='matched', label='Language match'))
        elif worker.preferred_language in (language_requirement, 'bilingual'):
            reasons.append(EligibilityReason(type='language', status='matched', label='Language match', code=language_requirement))
        else:
            reasons.append(
                EligibilityReason(
                    type='language',
                    status='missing',
                    label=f'Missing: {language_requirement.upper()}',
                    code=language_requirement,
                )
            )

        required_qualifications = [self._code(item) for item in (staffing_request.required_qualifications or [])]
        worker_qualification_values = {self._code(item) for item in (profile.qualifications or [])}
        reasons.extend(self._requirement_reasons('qualification', required_qualifications, worker_qualification_values))

        required_certifications = [self._code(item) for item in (staffing_request.required_certifications or [])]
        worker_certification_values = {self._code(item) for item in (profile.certifications or [])}
        reasons.extend(self._requirement_reasons('certification', required_certifications, worker_certification_values))

        return EligibilityResult(
            eligible=all(reason.status == 'matched' for reason in reasons),
            reasons=reasons,
        )

    @staticmethod
    def _requirement_reasons(
        reason_type: Literal['qualification', 'certification'],
        required_codes: list[str],
        worker_codes: set[str],
    ) -> list[EligibilityReason]:
        if not required_codes:
            return [
                EligibilityReason(
                    type=reason_type,
                    status='matched',
                    label=f'No {reason_type} required',
                )
            ]

        reasons: list[EligibilityReason] = []
        for code in required_codes:
            if code in worker_codes:
                reasons.append(
                    EligibilityReason(
                        type=reason_type,
                        status='matched',
                        label=f'{reason_type.title()} match',
                        code=code,
                    )
                )
            else:
                reasons.append(
                    EligibilityReason(
                        type=reason_type,
                        status='missing',
                        label=f'Missing: {code}',
                        code=code,
                    )
                )
        return reasons

    @staticmethod
    def _code(item: dict | str) -> str:
        if isinstance(item, dict):
            return str(item.get('code') or item.get('value') or item.get('label') or '').strip()
        return str(item).strip()
