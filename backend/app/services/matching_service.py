from datetime import date, time, timedelta
from typing import Literal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.availability import Availability
from app.models.enums import SlotPeriod
from app.models.staffing_request import StaffingRequest
from app.models.user import User
from app.models.worker_organization import WorkerOrganization
from app.repositories.assignment_repository import AssignmentRepository
from app.schemas.eligibility import EligibilityReason, EligibilityResult


def _slot_for_start_time(t: time) -> SlotPeriod:
    h = t.hour
    if 5 <= h < 12:
        return SlotPeriod.MORNING
    if 12 <= h < 17:
        return SlotPeriod.AFTERNOON
    if 17 <= h < 22:
        return SlotPeriod.EVENING
    return SlotPeriod.OVERNIGHT


class MatchingService:
    def __init__(self, db: Session | None = None) -> None:
        self.db = db

    def eligible_workers(self, staffing_request: StaffingRequest, workers: list[User]) -> list[User]:
        eligible: list[User] = []
        for worker in workers:
            result = self.eligibility_result(staffing_request, worker)
            if result.eligible:
                eligible.append(worker)

        return eligible

    def wants_notification(self, staffing_request: StaffingRequest, worker: User) -> bool:
        """Notification-preference gate (HANDOFF #12/#13 toggles).

        Applies to the broadcast paths only (publish / renotify) — never to
        eligibility or ranking, so reach estimates and best-match stay intact,
        and notify_specific bypasses it (a coordinator deliberately picking
        one substitute outranks a broadcast preference).
        """
        profile = worker.worker_profile
        if profile is None:
            return True
        if not profile.urgent_alert_opt_in:
            # "Urgent alerts — notify me for same-day requests": the system's
            # urgent flag (urgency_level >= 3, see notifications.py) or a
            # literal same-day work date.
            if staffing_request.urgency_level >= 3 or staffing_request.work_date <= date.today():
                return False
        if not profile.notify_weekend_overnight:
            # "Weekend overnights — notify me for overnight shifts on weekends".
            is_weekend = staffing_request.work_date.weekday() >= 5
            if is_weekend and _slot_for_start_time(staffing_request.start_time) == SlotPeriod.OVERNIGHT:
                return False
        return True

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
            return EligibilityResult(eligible=False, score=0, reasons=reasons)

        if profile is None:
            reasons.append(
                EligibilityReason(
                    type='profile',
                    status='missing',
                    label='Missing: worker profile',
                )
            )
            return EligibilityResult(eligible=False, score=0, reasons=reasons)

        # Org-selection gate: a worker who opted into specific orgs is only
        # eligible for those orgs' requests. No active selection = open to
        # all orgs (the opt-out default). Sits ahead of the availability
        # checks so opted-out workers drop from broadcasts, reach counts and
        # ranking panels for other orgs' shifts.
        if self.db is not None:
            selected_org_ids = set(self.db.scalars(
                select(WorkerOrganization.organization_id).where(
                    WorkerOrganization.user_id == worker.id,
                    WorkerOrganization.is_active.is_(True),
                )
            ).all())
            if selected_org_ids and staffing_request.organization_id not in selected_org_ids:
                reasons.append(
                    EligibilityReason(
                        type='organization',
                        status='missing',
                        label='Organization not selected',
                    )
                )
                return EligibilityResult(eligible=False, score=0, reasons=reasons)

        # Double-booking guard: a worker already committed to an overlapping
        # shift is ineligible — keeps them out of broadcasts and reach counts,
        # and surfaces "Already booked" in ranking panels. Excludes this
        # request's own assignment so re-checks on a won shift stay sane.
        if self.db is not None:
            booked = AssignmentRepository(self.db).overlapping_active_for_worker(
                worker.id,
                staffing_request.work_date,
                staffing_request.start_time,
                staffing_request.end_time,
                exclude_request_id=staffing_request.id,
            )
            if booked:
                reasons.append(
                    EligibilityReason(
                        type='availability',
                        status='missing',
                        label='Already booked',
                    )
                )
                return EligibilityResult(eligible=False, score=0, reasons=reasons)

        if profile.availability_status.value == 'available':
            if self.db is not None:
                grid_check = self._check_grid_for(worker.id, staffing_request.work_date, staffing_request.start_time)
                if grid_check is False:
                    reasons.append(EligibilityReason(
                        type='availability',
                        status='missing',
                        label='Slot not in weekly grid',
                    ))
                    return EligibilityResult(eligible=False, score=0, reasons=reasons)
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
            score=self._score(reasons),
            reasons=reasons,
        )

    def _check_grid_for(self, worker_user_id: UUID, work_date: date, start_time: time) -> bool | None:
        """Returns True if the worker's grid has this (date, slot) marked available,
        False if their grid covers that week but doesn't include this cell as available,
        and None if they haven't engaged with the grid for that week (fall through)."""
        if self.db is None:
            return None
        week_start = work_date - timedelta(days=work_date.weekday())
        week_end = week_start + timedelta(days=6)
        week_count = self.db.scalar(
            select(func.count(Availability.id))
            .where(Availability.user_id == worker_user_id)
            .where(Availability.specific_date.between(week_start, week_end))
        ) or 0
        if week_count == 0:
            return None
        slot = _slot_for_start_time(start_time)
        match = self.db.scalar(
            select(Availability.available)
            .where(Availability.user_id == worker_user_id)
            .where(Availability.specific_date == work_date)
            .where(Availability.slot == slot)
        )
        return bool(match)

    @staticmethod
    def _score(reasons: list[EligibilityReason]) -> int:
        if not reasons:
            return 0
        matched = sum(1 for r in reasons if r.status == 'matched')
        return round((matched / len(reasons)) * 100)

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
