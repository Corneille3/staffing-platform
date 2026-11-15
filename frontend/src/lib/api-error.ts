// An API refusal a screen can translate. Pure: no React, no "use client".
//
// The backend's coded errors look like
//   {"detail": {"code": "lead.lost_needs_reason", "message": "…", "params": {}}}
// and most others are a plain {"detail": "English sentence"}. Either way
// `message` is readable English, so code that only shows `err.message` keeps
// working; a bilingual screen looks at `code` first.

export type ApiErrorParams = Record<string, string | number>;

export class ApiError extends Error {
  readonly code: string | null;
  readonly params: ApiErrorParams;
  readonly status: number;

  constructor(message: string, status: number, code: string | null = null, params: ApiErrorParams = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.params = params;
  }
}

/** Reads a non-OK response body into an ApiError. `text` is the raw body. */
export function parseApiError(text: string, status: number, fallback: string): ApiError {
  if (!text) return new ApiError(fallback, status);
  try {
    const detail = JSON.parse(text)?.detail;
    if (typeof detail === "string") return new ApiError(detail, status);
    if (Array.isArray(detail)) {
      // Request validation: one entry per bad field, `loc` ends with its name.
      const message = detail.map((d) => d?.msg).filter(Boolean).join("; ");
      const fields = detail
        .map((d) => (Array.isArray(d?.loc) ? d.loc[d.loc.length - 1] : null))
        .filter((f): f is string => typeof f === "string");
      if (message) return new ApiError(message, status, "validation", { fields: [...new Set(fields)].join(", ") });
    }
    if (detail && typeof detail === "object" && typeof detail.message === "string") {
      const params: ApiErrorParams = {};
      for (const [key, value] of Object.entries(detail.params ?? {})) {
        if (typeof value === "string" || typeof value === "number") params[key] = value;
      }
      return new ApiError(detail.message, status, typeof detail.code === "string" ? detail.code : null, params);
    }
  } catch {
    // Not JSON — fall through to the raw text.
  }
  return new ApiError(text || fallback, status);
}
