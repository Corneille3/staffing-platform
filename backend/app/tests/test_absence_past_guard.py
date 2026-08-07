"""Finding #3 verification: absence/release must not broadcast an ended shift.

conftest pins shift_timezone='UTC', so naive wall-clock == UTC here.
"""
from datetime import date, time, timedelta

import pytest
from fastapi import HTTPException

from app.auth.scope import AccessScope
from app.models.enums import RequestRole
from app.schemas.replacement import AbsenceReportCreate
from app.services.replacement_service import ReplacementService


def _scope(seed):
    return AccessScope(user=seed.worker_a, tenant_id=seed.tenant.id)


def _absence(seed, work_date, start=time(8, 0), end=time(16, 0)):
    return AbsenceReportCreate(
        organization_id=seed.org.id, role=RequestRole.EDUCATOR,
        work_date=work_date, start_time=start, end_time=end, reason='sick', note='x',
    )


def test_absence_rejects_yesterday(db_session, seed):
    with pytest.raises(HTTPException) as exc:
        ReplacementService(db_session).report_absence(
            _absence(seed, date.today() - timedelta(days=1)), _scope(seed),
        )
    assert exc.value.status_code == 409


def test_absence_accepts_future(db_session, seed):
    repl = ReplacementService(db_session).report_absence(
        _absence(seed, date.today() + timedelta(days=3)), _scope(seed),
    )
    assert repl.id is not None
