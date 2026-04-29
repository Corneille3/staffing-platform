# Schema Alignment

Status: Accepted for commercial baseline

## Decision

The application will use normalized tables for staffing data that drives matching,
compliance, reporting, and operational decisions.

The initial MVP briefly used JSONB shortcut fields for worker regions,
qualifications, certifications, and request requirements. That shape is useful
for demos, but it is not the right commercial baseline because it weakens data
integrity and makes matching/reporting harder to validate.

## Normalized Commercial Tables

Worker capability data is stored in:

- `worker_regions`
- `worker_qualifications`
- `worker_certifications`

Request requirement data is stored in:

- `request_requirements`

The API may still expose convenience arrays such as `supported_cities`,
`qualifications`, `certifications`, `required_qualifications`, and
`required_certifications` while the database keeps the underlying data
normalized.

## JSONB Policy

JSONB remains appropriate for:

- audit payloads
- provider-specific notification payloads
- optional metadata that is not used for matching, permissions, reporting, or
  compliance decisions

JSONB should not be used for core matching fields, certification expiry,
regional eligibility, billing, permissions, or reporting dimensions.

## Migration Approach

There is no production data yet, so the initial migration can be corrected
directly instead of adding compatibility migrations that preserve the earlier
JSONB shape.
