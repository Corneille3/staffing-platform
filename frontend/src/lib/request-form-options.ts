// Shared option lists for the staffing-request create stepper and the
// edit-after-publish form. Kept in one place so the two surfaces can never
// drift (E2E bug #6 added the edit form).
//
// Values only — the labels are translated where they render:
// roles -> admin.roles (admin.form.roleOther for "other"), qualifications and
// certifications -> worker.credentials (useCredentialLabel), languages ->
// admin.languageNames (admin.form.noPreference for ""), coverage types ->
// admin.form.coverage.<value>.label / .sub.

export const ROLES = ["educator", "assistant_educator", "psw", "nurse", "food_handler", "other"].map((value) => ({ value }));

export const QUALIFICATIONS = ["ECE_LEVEL_1", "AEC_PETITE_ENFANCE", "DEC_TEE", "PSW", "NURSE"].map((code) => ({ code }));

export const CERTIFICATIONS = ["FIRST_AID", "FOOD_HANDLER", "CPR"].map((code) => ({ code }));

export const LANGUAGES = ["fr", "en", "bilingual", ""].map((value) => ({ value }));

export const COVERAGE_TYPES = ["same_day_urgent", "planned_absence", "recurring", "emergency"].map((value) => ({ value }));
