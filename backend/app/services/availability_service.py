from datetime import date, timedelta
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.availability import Availability
from app.repositories.availability_repository import AvailabilityRepository
from app.schemas.availability import AvailabilityCellWrite


def _monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


class AvailabilityService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = AvailabilityRepository(db)

    def get_week(self, user_id: UUID, week_start: date) -> list[Availability]:
        if week_start != _monday(week_start):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='week_start must be a Monday',
            )
        return self.repo.list_for_week(user_id, week_start)

    def replace_week(
        self,
        user_id: UUID,
        week_start: date,
        cells: list[AvailabilityCellWrite],
    ) -> list[Availability]:
        if week_start != _monday(week_start):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='week_start must be a Monday',
            )
        week_end = week_start + timedelta(days=6)
        rows: list[Availability] = []
        for cell in cells:
            if cell.specific_date < week_start or cell.specific_date > week_end:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail='cell.specific_date is outside the requested week',
                )
            if not cell.available:
                continue
            rows.append(Availability(
                id=uuid4(),
                user_id=user_id,
                specific_date=cell.specific_date,
                slot=cell.slot,
                available=True,
            ))
        saved = self.repo.replace_for_week(user_id, week_start, rows)
        self.db.commit()
        return saved

    def copy_previous_week(self, user_id: UUID, target_week_start: date) -> list[Availability]:
        if target_week_start != _monday(target_week_start):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='target_week_start must be a Monday',
            )
        previous_start = target_week_start - timedelta(days=7)
        previous_cells = self.repo.list_for_week(user_id, previous_start)
        rows = [
            Availability(
                id=uuid4(),
                user_id=user_id,
                specific_date=target_week_start + timedelta(days=(cell.specific_date - previous_start).days),
                slot=cell.slot,
                available=cell.available,
            )
            for cell in previous_cells
            if cell.available
        ]
        saved = self.repo.replace_for_week(user_id, target_week_start, rows)
        self.db.commit()
        return saved
