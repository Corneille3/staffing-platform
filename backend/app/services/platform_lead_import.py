"""Lead import — SPEC_PLATFORM_LEADS §8.

Reads a CSV or the *Leads* sheet of an XLSX whose headers are those of
`Staffig_Leads_2026-09.xlsx`, and upserts on the ID column (`external_ref`).

The rule that matters, and that the spec's "non-empty fields only" wording did
not cover: an import NEVER moves a lead backwards. In the source sheet every
row says « Nouveau », so a naive re-import would reset a lead the operator
already worked. On an existing lead:

- descriptive fields (name, segment, sites, contact details, score…) are
  refreshed when the file has a non-empty, different value;
- tracking fields (next action, its date, notes) are only filled when the
  lead has none — the operator's own text is never replaced;
- status and lost_reason are never touched.
"""
import csv
import io
from datetime import date, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.models.enums import LeadStatus
from app.models.platform_lead import PlatformLead, PlatformLeadEvent
from app.schemas.platform_leads import (
    BAN_PHASES, KINDS, SEGMENTS, SOURCES, WAVES, LeadImportResult, LeadImportSkipped,
)

MAX_BYTES = 5 * 1024 * 1024
MAX_ROWS = 5000
SHEET_NAME = 'Leads'

# xlsx header -> internal key (§8). Matched case-insensitively, trimmed.
HEADERS = {
    'id': 'external_ref',
    'organisation': 'org_name',
    'segment': 'segment',
    'sous-type': 'subtype',
    'type': 'kind',
    'nb sites': 'site_count',
    'capacité': 'capacity_note',
    'ville': 'city',
    'prov.': 'province',
    'régions': 'regions',
    'phase interdiction agences': 'agency_ban_phase',
    'langue': 'language',
    'site web': 'website',
    'téléphone': 'phone',
    'courriel': 'email',
    'contact (publié)': 'contact_name',
    'titre': 'contact_title',
    'recrute pab/inf.': 'hiring_signal',
    'score': 'score',
    'vague': 'wave',
    'statut': 'status',
    'source lead': 'source',
    'prochaine action': 'next_action',
    'date action': 'next_action_at',
    'notes': 'notes',
    'url source': 'source_url',
}
REQUIRED_HEADERS = ('organisation', 'segment', 'prov.')

SEGMENT_LABELS = {
    'rpa (qc)': 'rpa_qc',
    'chsld (qc)': 'chsld_qc',
    'cpe / garderies (qc)': 'cpe_qc',
    'ltc (on)': 'ltc_on',
    'retraite (on)': 'retirement_on',
    'agence (on)': 'agency_on',
    'petite enfance (sk)': 'childcare_sk',
    'ltc (sk)': 'ltc_sk',
    'commission scolaire': 'school_board',
    'autre': 'other',
}
KIND_LABELS = {'prospect': 'prospect', 'entreprise': 'enterprise', 'canal': 'channel'}
STATUS_LABELS = {
    'nouveau': 'new', 'contacté': 'contacted', 'démo bookée': 'demo_booked', 'pilote': 'pilot',
    'invitation envoyée': 'invited', 'gagné': 'won', 'perdu': 'lost',
}
EMPTY_MARKS = {'', '—', '-', '–', 'n/a', 'na'}

# Column lengths (models/platform_lead.py) — an over-long cell is trimmed, not fatal.
MAX_LEN = {
    'external_ref': 40, 'org_name': 255, 'subtype': 120, 'city': 120, 'website': 255,
    'phone': 60, 'email': 255, 'contact_name': 160, 'contact_title': 160, 'source_detail': 255,
}

DESCRIPTIVE = (
    'org_name', 'segment', 'subtype', 'kind', 'site_count', 'capacity_note', 'city', 'province',
    'regions', 'agency_ban_phase', 'language', 'website', 'phone', 'email', 'contact_name',
    'contact_title', 'hiring_signal', 'score', 'wave', 'source', 'source_detail', 'source_url',
)
FILL_IF_EMPTY = ('next_action', 'next_action_at', 'notes')


class RowError(Exception):
    """A row that cannot become a lead; the message goes into `skipped`."""


def _text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    text = str(value).strip()
    return None if text.lower() in EMPTY_MARKS else text


def _int(value: Any, label: str, low: int, high: int) -> int | None:
    text = _text(value)
    if text is None:
        return None
    try:
        number = int(float(text))
    except ValueError:
        raise RowError(f'{label}: "{text}" is not a number') from None
    if not low <= number <= high:
        raise RowError(f'{label}: {number} is out of range')
    return number


def _date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = _text(value)
    if text is None:
        return None
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%Y/%m/%d'):
        try:
            return datetime.strptime(text[:10], fmt).date()
        except ValueError:
            continue
    raise RowError(f'Date action: "{text}" is not a date (use YYYY-MM-DD)')


def normalize_row(raw: dict[str, Any]) -> dict[str, Any]:
    """One sheet row (internal keys) -> lead column values. Raises RowError."""
    out: dict[str, Any] = {}

    org_name = _text(raw.get('org_name'))
    if not org_name:
        raise RowError('missing organisation name')
    out['org_name'] = org_name
    out['external_ref'] = _text(raw.get('external_ref'))

    segment = _text(raw.get('segment'))
    if not segment:
        raise RowError('missing segment')
    code = SEGMENT_LABELS.get(segment.lower(), segment.lower())
    if code not in SEGMENTS:
        raise RowError(f'unknown segment "{segment}"')
    out['segment'] = code

    kind = _text(raw.get('kind'))
    if kind:
        kind_code = KIND_LABELS.get(kind.lower(), kind.lower())
        if kind_code not in KINDS:
            raise RowError(f'unknown type "{kind}"')
        out['kind'] = kind_code

    province = (_text(raw.get('province')) or '').upper()
    if len(province) != 2 or not province.isalpha():
        raise RowError('missing or invalid province (2 letters)')
    out['province'] = province

    # The agency ban is a Québec measure: « ON » / « SK » in this column just
    # repeat the province — phase none.
    phase = (_text(raw.get('agency_ban_phase')) or '').upper()
    out['agency_ban_phase'] = phase if phase in BAN_PHASES else 'none'

    language = (_text(raw.get('language')) or '').lower()
    if language in ('fr', 'en'):
        out['language'] = language

    hiring = (_text(raw.get('hiring_signal')) or '').lower()
    out['hiring_signal'] = {'oui': True, 'yes': True, 'non': False, 'no': False}.get(hiring)

    out['site_count'] = _int(raw.get('site_count'), 'Nb sites', 0, 100000)
    out['score'] = _int(raw.get('score'), 'Score', 0, 10)

    # « Canal » rows have no wave — the column is a single letter.
    wave = (_text(raw.get('wave')) or '').upper()
    out['wave'] = wave if wave in WAVES else None

    status_text = _text(raw.get('status'))
    if status_text:
        status_code = STATUS_LABELS.get(status_text.lower(), status_text.lower())
        if status_code not in STATUS_LABELS.values():
            raise RowError(f'unknown status "{status_text}"')
        if status_code in ('won', 'lost'):
            raise RowError(f'status "{status_text}" cannot be imported (won needs an active tenant, lost needs a reason)')
        out['status'] = status_code

    # « Recherche 2026-09 » -> source research, the label kept as the detail.
    source_text = _text(raw.get('source'))
    if source_text:
        lowered = source_text.lower()
        if lowered in SOURCES:
            out['source'] = lowered
        elif lowered.startswith('recherche') or lowered.startswith('research'):
            out['source'], out['source_detail'] = 'research', source_text
        else:
            out['source'], out['source_detail'] = 'other', source_text

    for key in ('subtype', 'capacity_note', 'city', 'regions', 'website', 'phone', 'email',
                'contact_name', 'contact_title', 'next_action', 'notes', 'source_url'):
        out[key] = _text(raw.get(key))
    out['next_action_at'] = _date(raw.get('next_action_at'))

    for key, limit in MAX_LEN.items():
        if isinstance(out.get(key), str):
            out[key] = out[key][:limit]
    return out


def _rows_from_xlsx(content: bytes) -> list[list[Any]]:
    from openpyxl import load_workbook  # heavy import, only needed here

    # data_only: Score and Vague are formulas in the source sheet — read the
    # values Excel cached, not the formula text.
    workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    try:
        sheet = workbook[SHEET_NAME] if SHEET_NAME in workbook.sheetnames else workbook.worksheets[0]
        return [list(row) for row in sheet.iter_rows(values_only=True)]
    finally:
        workbook.close()


def _rows_from_csv(content: bytes) -> list[list[Any]]:
    text = content.decode('utf-8-sig', errors='replace')
    first_line = text.split('\n', 1)[0]
    delimiter = ';' if first_line.count(';') > first_line.count(',') else ','
    return [row for row in csv.reader(io.StringIO(text), delimiter=delimiter)]


def read_rows(filename: str, content: bytes) -> list[tuple[int, dict[str, Any]]]:
    """-> [(row number as shown in the spreadsheet, {internal key: cell})]."""
    name = filename.lower()
    try:
        if name.endswith('.xlsx'):
            table = _rows_from_xlsx(content)
        elif name.endswith('.csv'):
            table = _rows_from_csv(content)
        else:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail='Upload a .xlsx or .csv file.',
            )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail='The file could not be read as a spreadsheet.',
        ) from None

    if not table:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='The file is empty.')

    columns: dict[int, str] = {}
    seen: set[str] = set()
    for index, cell in enumerate(table[0]):
        label = (_text(cell) or '').lower()
        if label in HEADERS:
            columns[index] = HEADERS[label]
            seen.add(label)
    missing = [h for h in REQUIRED_HEADERS if h not in seen]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f'Missing column(s): {", ".join(missing)}. Expected the headers of the Leads sheet.',
        )

    rows: list[tuple[int, dict[str, Any]]] = []
    for offset, cells in enumerate(table[1:], start=2):
        raw = {key: cells[index] for index, key in columns.items() if index < len(cells)}
        if all(_text(value) is None for value in raw.values()):
            continue  # blank spreadsheet line
        rows.append((offset, raw))
    if len(rows) > MAX_ROWS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f'Too many rows ({len(rows)}); the limit is {MAX_ROWS}.',
        )
    return rows


class LeadImportService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def run(self, filename: str, content: bytes, scope: AccessScope) -> LeadImportResult:
        if len(content) > MAX_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail='The file is larger than 5 MB.',
            )
        rows = read_rows(filename, content)

        existing = {
            lead.external_ref: lead
            for lead in self.db.scalars(
                select(PlatformLead).where(PlatformLead.external_ref.is_not(None))
            )
        }
        created = updated = unchanged = 0
        skipped: list[LeadImportSkipped] = []

        for row_number, raw in rows:
            try:
                values = normalize_row(raw)
            except RowError as exc:
                skipped.append(LeadImportSkipped(row=row_number, reason=str(exc)))
                continue

            ref = values.get('external_ref')
            lead = existing.get(ref) if ref else None
            if lead is None:
                lead = self._create(values, scope)
                if ref:
                    existing[ref] = lead
                created += 1
            elif self._refresh(lead, values, scope):
                updated += 1
            else:
                unchanged += 1

        self.db.commit()
        return LeadImportResult(created=created, updated=updated, unchanged=unchanged, skipped=skipped)

    def _create(self, values: dict[str, Any], scope: AccessScope) -> PlatformLead:
        data = {key: value for key, value in values.items() if value is not None}
        data['status'] = LeadStatus(data.get('status', 'new'))
        lead = PlatformLead(**data, created_by=scope.user.id)
        self.db.add(lead)
        self.db.flush()
        self.db.add(PlatformLeadEvent(
            lead_id=lead.id, type='imported', actor_id=scope.user.id, to_status=lead.status,
        ))
        return lead

    def _refresh(self, lead: PlatformLead, values: dict[str, Any], scope: AccessScope) -> bool:
        changed: list[str] = []
        for key in DESCRIPTIVE:
            incoming = values.get(key)
            if incoming is None or getattr(lead, key) == incoming:
                continue
            setattr(lead, key, incoming)
            changed.append(key)
        for key in FILL_IF_EMPTY:
            incoming = values.get(key)
            if incoming is None or getattr(lead, key) not in (None, ''):
                continue
            setattr(lead, key, incoming)
            changed.append(key)
        if not changed:
            return False
        self.db.add(PlatformLeadEvent(
            lead_id=lead.id, type='imported', actor_id=scope.user.id,
            body='Updated by import: ' + ', '.join(changed),
        ))
        return True
