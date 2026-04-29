from fastapi import APIRouter

from app.api.v1 import (
    assignments,
    audit_logs,
    auth,
    notifications,
    organizations,
    reports,
    request_responses,
    staffing_requests,
    users,
    workers,
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix='/auth', tags=['auth'])
api_router.include_router(organizations.router, prefix='/organizations', tags=['organizations'])
api_router.include_router(users.router, prefix='/users', tags=['users'])
api_router.include_router(workers.router, prefix='/workers', tags=['workers'])
api_router.include_router(staffing_requests.router, prefix='/requests', tags=['requests'])
api_router.include_router(request_responses.router, prefix='/requests', tags=['request_responses'])
api_router.include_router(assignments.router, prefix='/assignments', tags=['assignments'])
api_router.include_router(notifications.router, prefix='/notifications', tags=['notifications'])
api_router.include_router(reports.router, prefix='/reports', tags=['reports'])
api_router.include_router(audit_logs.router, prefix='/audit-logs', tags=['audit_logs'])
