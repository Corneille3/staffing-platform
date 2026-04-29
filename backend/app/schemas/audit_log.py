from datetime import datetime
from uuid import UUID

from app.schemas.common import ORMModel


class AuditLogRead(ORMModel):
    id: UUID
    actor_user_id: UUID | None = None
    organization_id: UUID | None = None
    entity_type: str
    entity_id: UUID | None = None
    action: str
    payload: dict
    created_at: datetime
