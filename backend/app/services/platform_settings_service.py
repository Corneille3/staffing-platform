"""Platform settings — new-tenant defaults + reserved-slug blocklist
(PLATFORM_HANDOFF §2.3-2.4). Singleton row; created on first read if missing."""
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.models.platform_settings import PlatformSettings
from app.services.platform_audit_service import PlatformAuditService

# Fallback if the settings row somehow doesn't exist yet (matches migration seed).
DEFAULT_RESERVED_SLUGS = [
    'os', 'app', 'www', 'api', 'admin', 'login', 'pick', 'staff', 'support', 'help', 'status',
]

# Operator-editable keys (data_residency is locked — Law 25).
EDITABLE_KEYS = {
    'default_language', 'trial_length_days', 'invite_expiry_days',
    'orphan_retention_days', 'reserved_slugs',
}


class PlatformSettingsService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.audit = PlatformAuditService(db)

    def get(self) -> PlatformSettings:
        row = self.db.scalar(select(PlatformSettings).limit(1))
        if row is None:
            row = PlatformSettings(id=uuid4(), reserved_slugs=list(DEFAULT_RESERVED_SLUGS))
            self.db.add(row)
            self.db.commit()
            self.db.refresh(row)
        return row

    def update(self, payload: dict, scope: AccessScope) -> PlatformSettings:
        row = self.get()
        touched = {}
        for key in EDITABLE_KEYS:
            if key in payload and payload[key] is not None:
                setattr(row, key, payload[key])
                touched[key] = payload[key]
        if touched:
            self.audit.log(
                actor_user_id=scope.user.id, action='settings.updated',
                target_type='platform_settings', payload=touched,
            )
        self.db.commit()
        self.db.refresh(row)
        return row


def reserved_slugs(db: Session) -> set[str]:
    """The effective reserved-slug blocklist (settings row, else the default)."""
    row = db.scalar(select(PlatformSettings).limit(1))
    if row and isinstance(row.reserved_slugs, list):
        return {str(s).lower() for s in row.reserved_slugs}
    return set(DEFAULT_RESERVED_SLUGS)
