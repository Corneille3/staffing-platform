from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class InboundSms(Base):
    """Receipt for every inbound text we accept.

    Coordinators will ask "did she really reply 1?" — this is the answer.
    Written for *every* signature-valid inbound, including the ones we could
    not match to a person or an open shift, because the unmatched ones are
    exactly what you need when a worker insists they replied.

    `matched_user_id` is nullable and ON DELETE SET NULL: removing a user must
    not erase the record that a message arrived. The raw `body` is kept
    verbatim — a paraphrase is worthless as evidence.
    """

    __tablename__ = 'inbound_sms'

    id: Mapped[UUID] = mapped_column(primary_key=True)
    from_number: Mapped[str] = mapped_column(String(50), index=True)
    body: Mapped[str] = mapped_column(Text)
    message_sid: Mapped[str | None] = mapped_column(String(64), unique=True)
    matched_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey('users.id', ondelete='SET NULL'), index=True
    )
    # What we did about it: claimed / lost_race / overlap / nothing_open /
    # opted_out / unknown_number / help. Kept as free text rather than an enum
    # so a new reply branch doesn't need a migration.
    action: Mapped[str] = mapped_column(String(40))
    staffing_request_id: Mapped[UUID | None] = mapped_column(
        ForeignKey('staffing_requests.id', ondelete='SET NULL'), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    matched_user = relationship('User')
