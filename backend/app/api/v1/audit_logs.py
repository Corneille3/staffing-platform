from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import require_apf
from app.repositories.audit_repository import AuditRepository
from app.schemas.audit_log import AuditLogRead

router = APIRouter(dependencies=[Depends(require_apf)])


@router.get('')
def list_audit_logs(db: Session = Depends(get_db_session)) -> dict[str, list[AuditLogRead]]:
    audit_logs = AuditRepository(db).list()
    return {'items': [AuditLogRead.model_validate(item) for item in audit_logs]}
