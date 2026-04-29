from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.assignment import Assignment


class AssignmentRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list(self) -> list[Assignment]:
        return list(self.db.scalars(select(Assignment).order_by(Assignment.assigned_at.desc())).all())

    def get_by_request(self, request_id):
        stmt = select(Assignment).where(Assignment.staffing_request_id == request_id)
        return self.db.scalar(stmt)

    def create(self, assignment: Assignment) -> Assignment:
        self.db.add(assignment)
        self.db.flush()
        self.db.refresh(assignment)
        return assignment
