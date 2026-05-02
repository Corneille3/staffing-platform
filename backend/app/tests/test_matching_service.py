from types import SimpleNamespace

from app.services.matching_service import MatchingService


def availability(value: str = 'available') -> SimpleNamespace:
    return SimpleNamespace(value=value)


def profile(
    *,
    status: str = 'available',
    cities: list[str] | None = None,
    qualifications: list[str] | None = None,
    certifications: list[str] | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        availability_status=availability(status),
        supported_cities=cities or ['Montreal'],
        qualifications=qualifications or ['ECE_LEVEL_1'],
        certifications=certifications or ['FIRST_AID'],
    )


def worker(**overrides) -> SimpleNamespace:
    defaults = {
        'is_active': True,
        'worker_profile': profile(),
        'preferred_language': 'fr',
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def request(**overrides) -> SimpleNamespace:
    defaults = {
        'city': 'Montreal',
        'language_requirement': 'fr',
        'required_qualifications': ['ECE_LEVEL_1'],
        'required_certifications': ['FIRST_AID'],
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def labels_for_missing(result) -> list[str]:
    return [reason.label for reason in result.reasons if reason.status == 'missing']


def test_eligibility_result_matches_fully_eligible_worker() -> None:
    result = MatchingService().eligibility_result(request(), worker())

    assert result.eligible is True
    assert labels_for_missing(result) == []
    assert {reason.type for reason in result.reasons} == {
        'availability',
        'city',
        'language',
        'qualification',
        'certification',
    }


def test_eligibility_result_marks_city_mismatch() -> None:
    result = MatchingService().eligibility_result(
        request(city='Quebec City'),
        worker(worker_profile=profile(cities=['Montreal'])),
    )

    assert result.eligible is False
    assert 'Missing: Quebec City' in labels_for_missing(result)


def test_eligibility_result_marks_language_mismatch() -> None:
    result = MatchingService().eligibility_result(
        request(language_requirement='en'),
        worker(preferred_language='fr'),
    )

    assert result.eligible is False
    assert 'Missing: EN' in labels_for_missing(result)


def test_eligibility_result_accepts_bilingual_worker_for_language_requirement() -> None:
    result = MatchingService().eligibility_result(
        request(language_requirement='en'),
        worker(preferred_language='bilingual'),
    )

    assert result.eligible is True


def test_eligibility_result_marks_missing_qualification() -> None:
    result = MatchingService().eligibility_result(
        request(required_qualifications=['ECE_LEVEL_2']),
        worker(worker_profile=profile(qualifications=['ECE_LEVEL_1'])),
    )

    assert result.eligible is False
    assert 'Missing: ECE_LEVEL_2' in labels_for_missing(result)


def test_eligibility_result_marks_missing_certification() -> None:
    result = MatchingService().eligibility_result(
        request(required_certifications=['CPR']),
        worker(worker_profile=profile(certifications=['FIRST_AID'])),
    )

    assert result.eligible is False
    assert 'Missing: CPR' in labels_for_missing(result)
