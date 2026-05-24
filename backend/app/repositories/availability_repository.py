from datetime import date, timedelta
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.availability import Availability


class AvailabilityRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_for_week(self, user_id: UUID, week_start: date) -> list[Availability]:
        week_end = week_start + timedelta(days=6)
        stmt = (
            select(Availability)
            .where(
                Availability.user_id == user_id,
                Availability.specific_date >= week_start,
                Availability.specific_date <= week_end,
            )
            .order_by(Availability.specific_date, Availability.slot)
        )
        return list(self.db.scalars(stmt).all())

    def replace_for_week(self, user_id: UUID, week_start: date, cells: list[Availability]) -> list[Availability]:
        week_end = week_start + timedelta(days=6)
        self.db.execute(
            delete(Availability).where(
                Availability.user_id == user_id,
                Availability.specific_date >= week_start,
                Availability.specific_date <= week_end,
            )
        )
        self.db.flush()
        for cell in cells:
            self.db.add(cell)
        self.db.flush()
        return cells
