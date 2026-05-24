from datetime import date
from uuid import UUID

from pydantic import BaseModel

from app.models.enums import SlotPeriod


class AvailabilityCellRead(BaseModel):
    id: UUID
    specific_date: date
    slot: SlotPeriod
    available: bool

    class Config:
        from_attributes = True


class AvailabilityCellWrite(BaseModel):
    specific_date: date
    slot: SlotPeriod
    available: bool


class AvailabilityGridRead(BaseModel):
    week_start: date
    cells: list[AvailabilityCellRead]


class AvailabilityGridWrite(BaseModel):
    week_start: date
    cells: list[AvailabilityCellWrite]


class AvailabilityCopyRequest(BaseModel):
    target_week_start: date
