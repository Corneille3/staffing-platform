import type { RequestResponse, StaffingRequest } from "./types";

// True when the coordinator edited the shift after the worker last looked at it
// — i.e. content_last_edited_at is ahead of last_reviewed_at (falling back to
// first viewed_at). Drives the worker-side "task was modified" banner, which
// clears once they open the request again (mark_viewed bumps last_reviewed_at).
export function modifiedSinceReview(
  request: StaffingRequest,
  response: RequestResponse | null | undefined,
): boolean {
  if (!request.content_last_edited_at || !response) return false;
  const edited = new Date(request.content_last_edited_at).getTime();
  const reviewedAt = response.last_reviewed_at ?? response.viewed_at;
  const reviewed = reviewedAt ? new Date(reviewedAt).getTime() : 0;
  return edited > reviewed;
}
