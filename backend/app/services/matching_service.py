from app.models.staffing_request import StaffingRequest
from app.models.user import User


class MatchingService:
    def eligible_workers(self, staffing_request: StaffingRequest, workers: list[User]) -> list[User]:
        eligible: list[User] = []
        for worker in workers:
            profile = worker.worker_profile
            if not worker.is_active or profile is None:
                continue
            if profile.availability_status.value != 'available':
                continue
            if staffing_request.city not in (profile.supported_cities or []):
                continue

            required_qualifications = staffing_request.required_qualifications or []
            worker_qualifications = profile.qualifications or []
            worker_qualification_values = {
                item.get('code', item) if isinstance(item, dict) else item for item in worker_qualifications
            }
            if any(
                (item.get('code', item) if isinstance(item, dict) else item) not in worker_qualification_values
                for item in required_qualifications
            ):
                continue

            if staffing_request.language_requirement and staffing_request.language_requirement not in (
                worker.preferred_language,
                'bilingual',
            ):
                continue

            eligible.append(worker)

        return eligible
