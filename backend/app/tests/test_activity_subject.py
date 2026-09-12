"""Activity rows name the target of a removal (finding from the 2026-09-10
verification: 44 "USER REMOVED by Josy" rows, none said who)."""
from app.services.reporting_service import _activity_subject


def test_subject_prefers_the_recorded_name_then_the_original_email():
    assert _activity_subject('user.removed', {'first_name': 'Casey', 'last_name': 'Manager', 'email': 'c@x.org'}) == 'Casey Manager'
    # Rows written before the name was recorded (all 44 on prod) still say who.
    assert _activity_subject('user.removed', {'email': 'casey@example.org', 'role': 'org_admin'}) == 'casey@example.org'
    assert _activity_subject('tenant.removed', {'tenant_name': 'EGK Solution Inc.', 'tenant_slug': 'egk'}) == 'EGK Solution Inc.'
    assert _activity_subject('staffing_request.published', {'anything': 1}) is None
    assert _activity_subject('user.removed', None) is None


def test_removal_row_carries_the_removed_persons_name(apf_client, monkeypatch, seed):
    from app.notifications import email_service
    from uuid import uuid4

    monkeypatch.setattr(
        email_service.EmailNotificationService, 'send',
        lambda self, message: {'channel': 'email', 'delivery_status': 'sent', 'recipient': message.to_email},
    )
    invited = apf_client.post('/api/v1/coordinators/invite', json={
        'first_name': 'Casey', 'last_name': 'Manager',
        'email': f'casey-{uuid4().hex[:8]}@example.org', 'org_ids': [str(seed.org.id)],
    }).json()
    assert apf_client.delete(f"/api/v1/users/{invited['id']}").status_code == 200

    rows = apf_client.get('/api/v1/apf/activity?filter=removals').json()['items']
    removal = next(r for r in rows if r['action'] == 'user.removed' and r['entity_id'] == invited['id'])
    assert removal['subject'] == 'Casey Manager'
    # Everything else keeps a null subject — the field is removal-only.
    assert all(r.get('subject') is None for r in apf_client.get('/api/v1/apf/activity?filter=assigned').json()['items'])
