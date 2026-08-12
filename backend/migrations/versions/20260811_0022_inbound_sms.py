"""Inbound SMS: receipt table + E.164 phone normalization (spec Feature 1 step 2).

Two halves of the same problem — recognizing who texted us.

`inbound_sms` keeps a receipt of every signature-valid inbound message so a
coordinator can answer "did she really reply 1?".

The phone backfill exists because Twilio hands us strict E.164 (`+15145550001`)
while `users.phone` is whatever a coordinator typed — `(514) 555-0001`,
`514-555-0001`, `1 514 555 0001`. Without a shared shape, a worker's reply
matches nobody and their claim silently disappears.

Normalization is NANP-only, matching app/core/phone.py: 10 digits get `+1`,
11 starting with `1` get `+`. Rows we can't confidently parse are left alone
rather than mangled — a non-match is recoverable, a corrupted number is not.
Ambiguity is not resolved here: if two users end up sharing a normalized
number, the service refuses to guess and replies "unknown number" (matching a
claim to the wrong person is far worse than dropping it).

Revision ID: 20260811_0022
Revises: 20260811_0021
Create Date: 2026-08-11 00:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = '20260811_0022'
down_revision = '20260811_0021'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'inbound_sms',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('from_number', sa.String(length=50), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('message_sid', sa.String(length=64), nullable=True, unique=True),
        sa.Column(
            'matched_user_id', sa.UUID(),
            sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True,
        ),
        sa.Column('action', sa.String(length=40), nullable=False),
        sa.Column(
            'staffing_request_id', sa.UUID(),
            sa.ForeignKey('staffing_requests.id', ondelete='SET NULL'), nullable=True,
        ),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_inbound_sms_from_number', 'inbound_sms', ['from_number'])
    op.create_index('ix_inbound_sms_matched_user_id', 'inbound_sms', ['matched_user_id'])
    op.create_index('ix_inbound_sms_staffing_request_id', 'inbound_sms', ['staffing_request_id'])

    # Backfill: strip every non-digit, then prefix by length. Only touches rows
    # that parse cleanly as NANP; anything else keeps its current value.
    op.execute(
        """
        UPDATE users
           SET phone = CASE
                 WHEN length(regexp_replace(phone, '\\D', '', 'g')) = 10
                      THEN '+1' || regexp_replace(phone, '\\D', '', 'g')
                 WHEN length(regexp_replace(phone, '\\D', '', 'g')) = 11
                      AND regexp_replace(phone, '\\D', '', 'g') LIKE '1%'
                      THEN '+' || regexp_replace(phone, '\\D', '', 'g')
                 ELSE phone
               END
         WHERE phone IS NOT NULL
           AND phone <> ''
        """
    )


def downgrade() -> None:
    # Phone formatting is not restored — the original free-text spacing is not
    # recoverable, and E.164 is valid input for every path that reads it.
    op.drop_index('ix_inbound_sms_staffing_request_id', table_name='inbound_sms')
    op.drop_index('ix_inbound_sms_matched_user_id', table_name='inbound_sms')
    op.drop_index('ix_inbound_sms_from_number', table_name='inbound_sms')
    op.drop_table('inbound_sms')
