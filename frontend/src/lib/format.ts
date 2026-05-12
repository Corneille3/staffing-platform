import type { RequestRole, StaffingRequest, WorkerProfile } from "./types";

// Haversine distance in km between two lat/lng pairs
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function toNum(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

export function distanceFromWorker(
  request: StaffingRequest,
  profile: WorkerProfile | null | undefined,
): number | null {
  const homeLat = toNum(profile?.home_latitude);
  const homeLng = toNum(profile?.home_longitude);
  const orgLat = toNum(request.organization?.latitude);
  const orgLng = toNum(request.organization?.longitude);
  if (homeLat == null || homeLng == null || orgLat == null || orgLng == null) return null;
  return haversineKm(homeLat, homeLng, orgLat, orgLng);
}

export function formatDistance(km: number | null): string | null {
  if (km == null) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

// Human-friendly date format: "Today · 19 May" / "Thu 21 May"
export function formatWorkDate(isoDate: string, locale: "en" | "fr"): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const dayMonth = new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    day: "numeric",
    month: "short",
  }).format(date);

  const sameDay = date.getTime() === today.getTime();
  const isTomorrow = date.getTime() === tomorrow.getTime();

  if (sameDay) return locale === "fr" ? `Aujourd'hui · ${dayMonth}` : `Today · ${dayMonth}`;
  if (isTomorrow) return locale === "fr" ? `Demain · ${dayMonth}` : `Tomorrow · ${dayMonth}`;

  const weekday = new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    weekday: "short",
  }).format(date);
  return `${weekday} ${dayMonth}`;
}

const ROLE_LABEL: Record<RequestRole, { en: string; fr: string }> = {
  educator:           { en: "Educator",            fr: "Éducateur·trice" },
  assistant_educator: { en: "Assistant educator",  fr: "Aide-éducateur·trice" },
  psw:                { en: "PSW",                 fr: "Préposé·e aux bénéficiaires" },
  nurse:              { en: "Nurse",               fr: "Infirmier·ère" },
  food_handler:       { en: "Food handler",        fr: "Préposé·e à l'alimentation" },
  other:              { en: "Other",               fr: "Autre" },
};

const SECTOR_LABEL: Record<string, { en: string; fr: string }> = {
  childcare:        { en: "childcare",          fr: "petite enfance" },
  long_term_care:   { en: "long-term care",     fr: "soins de longue durée" },
  community_care:   { en: "community care",     fr: "soins communautaires" },
  home_care:        { en: "home care",          fr: "soins à domicile" },
  assisted_living:  { en: "assisted living",    fr: "résidence" },
  other:            { en: "care",               fr: "soins" },
};

export function roleSectorSubtitle(
  request: StaffingRequest,
  locale: "en" | "fr",
): string {
  const role = request.role ? ROLE_LABEL[request.role][locale] : null;
  const sectorKey = request.organization?.type;
  const sector = sectorKey && SECTOR_LABEL[sectorKey] ? SECTOR_LABEL[sectorKey][locale] : null;
  return [role, sector].filter(Boolean).join(" · ");
}

export function locationLabel(request: StaffingRequest): string {
  const neighbourhood = request.organization?.neighbourhood;
  if (neighbourhood) return `${request.city} · ${neighbourhood}`;
  return request.city;
}
