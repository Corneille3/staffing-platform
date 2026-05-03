import logging

from sqlalchemy.orm import Session

from app.models.organization import Organization
from app.models.staffing_request import StaffingRequest
from app.models.user import User
from app.notifications.email_service import EmailMessage, EmailNotificationService

logger = logging.getLogger(__name__)


def _fmt_time(t) -> str:
    if not t:
        return ''
    if hasattr(t, 'strftime'):
        return t.strftime('%H:%M')
    return str(t)[:5]


def _org_name(db: Session, request: StaffingRequest) -> str:
    org = db.get(Organization, request.organization_id)
    return org.name if org else str(request.organization_id)


def _body_new_request(worker: User, request: StaffingRequest, org_name: str) -> str:
    location = f'{request.location_name}, {request.city}' if request.location_name else request.city
    start = _fmt_time(request.start_time)
    end = _fmt_time(request.end_time)
    return (
        f'Bonjour {worker.first_name},\n\n'
        f'Une nouvelle demande de remplacement est disponible.\n\n'
        f'Titre       : {request.title}\n'
        f'Date        : {request.work_date}\n'
        f'Heure       : {start} – {end}\n'
        f'Lieu        : {location}\n'
        f'Organisation: {org_name}\n\n'
        f'Connectez-vous à la plateforme APF pour accepter ou refuser cette demande.\n'
        f'\n---\n\n'
        f'Hello {worker.first_name},\n\n'
        f'A new coverage request is available.\n\n'
        f'Title       : {request.title}\n'
        f'Date        : {request.work_date}\n'
        f'Time        : {start} – {end}\n'
        f'Location    : {location}\n'
        f'Organization: {org_name}\n\n'
        f'Sign in to the APF platform to accept or decline this request.\n'
    )


def _body_assignment_confirmed(worker: User, request: StaffingRequest, org_name: str) -> str:
    location = f'{request.location_name}, {request.city}' if request.location_name else request.city
    start = _fmt_time(request.start_time)
    end = _fmt_time(request.end_time)
    contact_line = ''
    if request.contact_name:
        parts = [request.contact_name]
        if request.contact_phone:
            parts.append(request.contact_phone)
        if request.contact_email:
            parts.append(request.contact_email)
        contact_line = f'Contact     : {" · ".join(parts)}\n'
    arrival_line = f'Arrivée     : {request.arrival_instructions}\n' if request.arrival_instructions else ''

    return (
        f'Bonjour {worker.first_name},\n\n'
        f'Votre affectation a été confirmée.\n\n'
        f'Titre       : {request.title}\n'
        f'Date        : {request.work_date}\n'
        f'Heure       : {start} – {end}\n'
        f'Lieu        : {location}\n'
        f'Organisation: {org_name}\n'
        f'{contact_line}'
        f'{arrival_line}'
        f'\nBonne journée !\n'
        f'\n---\n\n'
        f'Hello {worker.first_name},\n\n'
        f'Your assignment has been confirmed.\n\n'
        f'Title       : {request.title}\n'
        f'Date        : {request.work_date}\n'
        f'Time        : {start} – {end}\n'
        f'Location    : {location}\n'
        f'Organization: {org_name}\n'
        f'{contact_line}'
        f'{arrival_line}'
        f'\nHave a great day!\n'
    )


def _body_assignment_cancelled(worker: User, request: StaffingRequest) -> str:
    return (
        f'Bonjour {worker.first_name},\n\n'
        f'Votre affectation pour « {request.title} » le {request.work_date} a été annulée.\n\n'
        f'Connectez-vous à la plateforme APF pour voir les demandes disponibles.\n'
        f'\n---\n\n'
        f'Hello {worker.first_name},\n\n'
        f'Your assignment for "{request.title}" on {request.work_date} has been cancelled.\n\n'
        f'Sign in to the APF platform to browse available requests.\n'
    )


class NotificationDispatcher:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.email = EmailNotificationService()

    def notify_workers(self, request: StaffingRequest, workers: list[User]) -> None:
        if not workers:
            return
        org_name = _org_name(self.db, request)
        subject = f'[APF] Nouveau remplacement : {request.title} / New coverage: {request.title}'
        for worker in workers:
            try:
                self.email.send(EmailMessage(
                    to_email=worker.email,
                    subject=subject,
                    body=_body_new_request(worker, request, org_name),
                ))
            except Exception:
                logger.exception('notify_workers failed for worker %s', worker.id)

    def notify_assignment_confirmed(self, request: StaffingRequest, worker: User) -> None:
        org_name = _org_name(self.db, request)
        subject = f'[APF] Affectation confirmée : {request.title} / Assignment confirmed: {request.title}'
        try:
            self.email.send(EmailMessage(
                to_email=worker.email,
                subject=subject,
                body=_body_assignment_confirmed(worker, request, org_name),
            ))
        except Exception:
            logger.exception('notify_assignment_confirmed failed for worker %s', worker.id)

    def notify_assignment_cancelled(self, request: StaffingRequest, worker: User) -> None:
        subject = f'[APF] Affectation annulée : {request.title} / Assignment cancelled: {request.title}'
        try:
            self.email.send(EmailMessage(
                to_email=worker.email,
                subject=subject,
                body=_body_assignment_cancelled(worker, request),
            ))
        except Exception:
            logger.exception('notify_assignment_cancelled failed for worker %s', worker.id)
