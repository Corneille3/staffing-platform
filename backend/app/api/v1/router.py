from fastapi import APIRouter

from app.api.v1 import (
    admin_activity,
    admin_dashboard,
    admin_organizations,
    admin_requests,
    admin_substitutes,
    apf,
    assignments,
    audit_logs,
    auth,
    coordinators,
    networks,
    notifications,
    organizations,
    platform,
    reports,
    request_responses,
    staffing_requests,
    users,
    workers,
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix='/auth', tags=['auth'])
api_router.include_router(organizations.router, prefix='/organizations', tags=['organizations'])
api_router.include_router(coordinators.router, prefix='/coordinators', tags=['coordinators'])
api_router.include_router(users.router, prefix='/users', tags=['users'])
api_router.include_router(workers.router, prefix='/workers', tags=['workers'])
api_router.include_router(staffing_requests.router, prefix='/requests', tags=['requests'])
api_router.include_router(request_responses.router, prefix='/requests', tags=['request_responses'])
api_router.include_router(assignments.router, prefix='/assignments', tags=['assignments'])
api_router.include_router(notifications.router, prefix='/notifications', tags=['notifications'])
api_router.include_router(reports.router, prefix='/reports', tags=['reports'])
api_router.include_router(audit_logs.router, prefix='/audit-logs', tags=['audit_logs'])
api_router.include_router(networks.router, prefix='/networks', tags=['networks'])
api_router.include_router(platform.router, prefix='/platform', tags=['platform'])
api_router.include_router(apf.router, prefix='/apf', tags=['apf'])
api_router.include_router(admin_substitutes.router, prefix='/admin/substitutes', tags=['admin'])
api_router.include_router(admin_requests.router, prefix='/admin/requests', tags=['admin'])
api_router.include_router(admin_organizations.router, prefix='/admin/organizations', tags=['admin'])
api_router.include_router(admin_activity.router, prefix='/admin/activity', tags=['admin'])
api_router.include_router(admin_dashboard.router, prefix='/admin/dashboard', tags=['admin'])
