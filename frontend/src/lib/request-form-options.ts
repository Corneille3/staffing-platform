// Shared option lists for the staffing-request create stepper and the
// edit-after-publish form. Kept in one place so the two surfaces can never
// drift (E2E bug #6 added the edit form).

export const ROLES: { value: string; label: string }[] = [
  { value: "educator", label: "Educator" },
  { value: "assistant_educator", label: "Assistant educator" },
  { value: "psw", label: "PSW" },
  { value: "nurse", label: "Nurse" },
  { value: "food_handler", label: "Food handler" },
  { value: "other", label: "Other" },
];

export const QUALIFICATIONS = [
  { code: "ECE_LEVEL_1", label: "ECE Level 1" },
  { code: "AEC_PETITE_ENFANCE", label: "AEC Petite enfance" },
  { code: "DEC_TEE", label: "DEC TEE" },
  { code: "PSW", label: "PSW" },
  { code: "NURSE", label: "Nurse" },
];

export const CERTIFICATIONS = [
  { code: "FIRST_AID", label: "First Aid" },
  { code: "FOOD_HANDLER", label: "Food Handler" },
  { code: "CPR", label: "CPR" },
];

export const LANGUAGES = [
  { value: "fr", label: "French" },
  { value: "en", label: "English" },
  { value: "bilingual", label: "Bilingual" },
  { value: "", label: "No preference" },
];

export const COVERAGE_TYPES: { value: string; label: string; sub: string }[] = [
  { value: "same_day_urgent", label: "Same-day urgent", sub: "Notify in 15 min · phone too" },
  { value: "planned_absence", label: "Planned absence", sub: "Notify over 24 h" },
  { value: "recurring", label: "Recurring", sub: "Repeats weekly" },
  { value: "emergency", label: "Emergency", sub: "Page everyone available" },
];
