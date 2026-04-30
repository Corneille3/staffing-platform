export type Locale = "en" | "fr";

const RESPONSE_LABELS: Record<string, Record<Locale, string>> = {
  notified: { en: "New request", fr: "Nouvelle demande" },
  viewed: { en: "Awaiting your reply", fr: "En attente de votre réponse" },
  accepted: { en: "Response sent", fr: "Réponse envoyée" },
  declined: { en: "You declined", fr: "Vous avez refusé" },
  withdrawn: { en: "Withdrawn", fr: "Retirée" },
  no_response: { en: "No response", fr: "Pas de réponse" },
};

const ASSIGNMENT_LABELS: Record<string, Record<Locale, string>> = {
  pending_confirmation: { en: "Waiting for confirmation", fr: "En attente de confirmation" },
  confirmed: { en: "Confirmed", fr: "Confirmée" },
  cancelled: { en: "Cancelled", fr: "Annulée" },
  completed: { en: "Completed", fr: "Terminée" },
};

const REQUEST_LABELS: Record<string, Record<Locale, string>> = {
  draft: { en: "Draft", fr: "Brouillon" },
  open: { en: "Open", fr: "Ouverte" },
  notified: { en: "Notified", fr: "Notifiée" },
  responses_received: { en: "Responses in", fr: "Réponses reçues" },
  assigned: { en: "Filled", fr: "Comblée" },
  completed: { en: "Completed", fr: "Terminée" },
  cancelled: { en: "Cancelled", fr: "Annulée" },
  expired: { en: "Expired", fr: "Expirée" },
};

const AVAILABILITY_LABELS: Record<string, Record<Locale, string>> = {
  available: { en: "Available", fr: "Disponible" },
  unavailable: { en: "Unavailable", fr: "Indisponible" },
};

const NOT_SELECTED: Record<Locale, string> = {
  en: "Not selected",
  fr: "Non sélectionné·e",
};

const RESPONSE_SENT_WAITING: Record<Locale, string> = {
  en: "Response sent · Waiting for confirmation",
  fr: "Réponse envoyée · En attente de confirmation",
};

function pick(
  map: Record<string, Record<Locale, string>>,
  key: string | null | undefined,
  locale: Locale,
): string {
  if (!key) return "";
  const entry = map[key];
  if (!entry) return key.replace(/_/g, " ");
  return entry[locale] ?? entry.en;
}

export function pickLocale(preferredLanguage: string | null | undefined): Locale {
  return preferredLanguage === "fr" ? "fr" : "en";
}

export function responseStatusLabel(status: string, locale: Locale = "en"): string {
  return pick(RESPONSE_LABELS, status, locale);
}

export function assignmentStatusLabel(status: string, locale: Locale = "en"): string {
  return pick(ASSIGNMENT_LABELS, status, locale);
}

export function requestStatusLabel(status: string, locale: Locale = "en"): string {
  return pick(REQUEST_LABELS, status, locale);
}

export function availabilityStatusLabel(status: string, locale: Locale = "en"): string {
  return pick(AVAILABILITY_LABELS, status, locale);
}

type RequestForPerspective = {
  status: string;
  assigned_worker_user_id: string | null;
};
type ResponseForPerspective = { status: string };

export function workerRequestPerspective(
  request: RequestForPerspective,
  myResponse: ResponseForPerspective | null | undefined,
  myUserId: string,
  locale: Locale = "en",
): string {
  if (request.status === "cancelled") return pick(REQUEST_LABELS, "cancelled", locale);
  if (request.status === "completed") return pick(REQUEST_LABELS, "completed", locale);
  if (request.status === "expired") return pick(REQUEST_LABELS, "expired", locale);

  if (request.status === "assigned" && request.assigned_worker_user_id) {
    if (request.assigned_worker_user_id === myUserId) {
      return pick(ASSIGNMENT_LABELS, "confirmed", locale);
    }
    return NOT_SELECTED[locale];
  }

  if (!myResponse) {
    return pick(RESPONSE_LABELS, "notified", locale);
  }
  if (myResponse.status === "accepted") {
    return RESPONSE_SENT_WAITING[locale];
  }
  return pick(RESPONSE_LABELS, myResponse.status, locale);
}
