"""E2E bugs #2 + #3: email locale selection and From header/envelope parsing."""
from app.core.config import settings
from app.notifications.email_service import _from_parts
from app.notifications.i18n import localized, localized_subject

FR = 'Bonjour Marie,\nTexte en français.'
EN = 'Hello Marie,\nEnglish text.'


def test_localized_fr_only():
    assert localized('fr', FR, EN) == FR


def test_localized_en_only():
    assert localized('en', FR, EN) == EN


def test_localized_bilingual_has_both_french_first():
    out = localized('bilingual', FR, EN)
    assert FR in out and EN in out
    assert out.index(FR) < out.index(EN)


def test_localized_unknown_falls_back_to_both():
    assert localized(None, FR, EN) == localized('', FR, EN) == f'{FR}\n---\n\n{EN}'


def test_localized_subject_is_single_line():
    """A bilingual subject must stay one line — joined with ' / ', never the
    multi-line body separator (which would mangle the email header)."""
    assert localized_subject('fr', 'Sujet FR', 'EN subject') == 'Sujet FR'
    assert localized_subject('en', 'Sujet FR', 'EN subject') == 'EN subject'
    bilingual = localized_subject('bilingual', 'Sujet FR', 'EN subject')
    assert bilingual == 'Sujet FR / EN subject'
    assert '\n' not in bilingual


def test_from_parts_adds_name_to_bare_address(monkeypatch):
    monkeypatch.setattr(settings, 'smtp_from', 'noreply@staffig.kouamvision.com')
    header, envelope = _from_parts()
    assert header == 'Staffig <noreply@staffig.kouamvision.com>'
    # Envelope sender must be the bare address, never the "Name <addr>" form.
    assert envelope == 'noreply@staffig.kouamvision.com'


def test_from_parts_preserves_existing_name(monkeypatch):
    monkeypatch.setattr(settings, 'smtp_from', 'Staffig Team <noreply@staffig.kouamvision.com>')
    header, envelope = _from_parts()
    assert header == 'Staffig Team <noreply@staffig.kouamvision.com>'
    assert envelope == 'noreply@staffig.kouamvision.com'
