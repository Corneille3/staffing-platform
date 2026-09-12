"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Calendar, Check, MapPin, RefreshCw, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "../../../../../i18n/navigation";
import {
  acceptRequest,
  claimShift,
  declineRequest,
  fetchRequest,
  fetchRequestEligibility,
  fetchRequestResponses,
  markRequestViewed,
} from "../../../../../lib/browser-api";
import {
  distanceFromWorker,
  formatDistance,
  formatWorkDate,
  locationLabel,
  roleSectorSubtitle,
} from "../../../../../lib/format";
import { modifiedSinceReview } from "../../../../../lib/request-modified";
import { EligibilityResult, RequestResponse, StaffingRequest } from "../../../../../lib/types";
import { useWorkerSession } from "../../../../../lib/worker-session";
import { Chip, Eyebrow, Mono } from "../../../../../components/ui";

const FILLED_STATUSES = ["assigned", "completed", "cancelled", "expired"];

export default function WorkerRequestDetailPage() {
  const { worker } = useWorkerSession();
  const params = useParams<{ id: string }>();
  const requestId = params?.id;
  const router = useRouter();
  const locale = useLocale() as "fr" | "en";
  const t = useTranslations("worker.requestDetail");
  const tCommon = useTranslations("common");

  const [request, setRequest] = useState<StaffingRequest | null>(null);
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
  const [myResponse, setMyResponse] = useState<RequestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declineModalOpen, setDeclineModalOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState<string>("");
  const [declineNotes, setDeclineNotes] = useState("");
  // Self-serve replacement (§3): someone else grabbed it first.
  const [lost, setLost] = useState(false);

  useEffect(() => {
    if (!worker || !requestId) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [req, elig, responses] = await Promise.all([
          fetchRequest(requestId),
          fetchRequestEligibility(requestId, worker.id).catch(() => null),
          fetchRequestResponses(requestId).catch(() => [] as RequestResponse[]),
        ]);
        if (!alive) return;
        setRequest(req);
        setEligibility(elig);
        const mine = responses.find((r) => r.worker_user_id === worker.id) ?? null;
        setMyResponse(mine);
        // Mark on every open (not just first) so last_reviewed_at advances and
        // the "modified" banner clears after they've looked at the change.
        if (mine) {
          markRequestViewed(requestId, worker.id).catch(() => undefined);
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [worker, requestId]);

  if (!worker) return null;

  if (loading) {
    return <Centered>{t("loading")}</Centered>;
  }

  if (error || !request) {
    return <Centered>{error ?? t("notFound")}</Centered>;
  }

  const urgent = request.urgency_level >= 3;
  const isFilled = FILLED_STATUSES.includes(request.status);
  const alreadyAccepted = myResponse?.status === "accepted";
  const alreadyDeclined = myResponse?.status === "declined";
  // First come, first served is the request's own flag: an AUTO release, an
  // AUTO absence, or a coordinator request published with the checkbox on.
  // A MANAGED release / a classic coordinator request (auto_assign=false) is
  // accepted/declined like any request — the coordinator picks who to assign —
  // so it falls through to the normal CTAs.
  const isAutoReplacement = request.auto_assign === true;
  const wonByMe = request.status === "assigned" && request.assigned_worker_user_id === worker.id;
  const canClaim = isAutoReplacement && !isFilled && !lost;
  const showCtas = !isAutoReplacement && !isFilled && !alreadyAccepted && !alreadyDeclined;

  const subtitle = roleSectorSubtitle(request, locale);
  const dateLabel = formatWorkDate(request.work_date, locale);
  const timeRange = `${request.start_time.slice(0, 5)} → ${request.end_time.slice(0, 5)}`;
  const distanceKm = distanceFromWorker(request, worker.profile);
  const distanceLabel = formatDistance(distanceKm);
  const durationLabel = computeDuration(request.start_time, request.end_time);

  async function handleAccept() {
    if (!worker || !request) return;
    setBusy(true);
    try {
      await acceptRequest(request.id, worker.id);
      router.push(`/worker/requests/${request.id}/accepted`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accept failed");
      setBusy(false);
    }
  }

  async function handleDecline() {
    if (!worker || !request) return;
    const reasonParts = [declineReason, declineNotes.trim()].filter(Boolean);
    const reason = reasonParts.length > 0 ? reasonParts.join(" — ") : undefined;
    setBusy(true);
    try {
      await declineRequest(request.id, worker.id, reason);
      router.push("/worker");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Decline failed");
      setBusy(false);
    }
  }

  async function handleClaim() {
    if (!request) return;
    setBusy(true);
    setError(null);
    try {
      await claimShift(request.id);
      router.push(`/worker/requests/${request.id}/accepted`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Claim failed";
      // "already_filled" → someone beat us to it (ReplacementLost), no error tone.
      if (msg.includes("already_filled")) {
        setLost(true);
      } else {
        setError(msg);
      }
      setBusy(false);
    }
  }

  return (
    <div style={{ paddingBottom: showCtas || canClaim ? 96 : 32 }}>
      {/* Header with back arrow */}
      <div style={{ display: "flex", alignItems: "center", paddingTop: 16, marginBottom: 16 }}>
        <Link
          href="/worker"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--ink-2)",
            textDecoration: "none",
            fontSize: 14,
            padding: "8px 4px",
          }}
        >
          <ArrowLeft size={16} />
          <span>{t("back")}</span>
        </Link>
      </div>

      {/* Urgent banner */}
      {urgent && (
        <div style={{
          background: "var(--rose-soft)",
          color: "var(--rose)",
          borderRadius: 12,
          padding: "10px 14px",
          marginBottom: 14,
          fontSize: 13,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--rose)" }} />
          {t("urgentBanner")}
        </div>
      )}

      {/* "Shift details changed since you last looked" — clears on next open. */}
      {modifiedSinceReview(request, myResponse) && (
        <div style={{
          background: "var(--sand-soft)",
          color: "#7C5C12",
          border: "0.5px solid var(--sand)",
          borderRadius: 12,
          padding: "10px 14px",
          marginBottom: 14,
          fontSize: 13,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <RefreshCw size={14} strokeWidth={2} />
          {t("modifiedBanner")}
        </div>
      )}

      {/* Title block */}
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 28, lineHeight: 1.1 }}>
          {request.organization?.name ?? request.title}
        </h1>
        {subtitle && (
          <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 4 }}>{subtitle}</div>
        )}
      </div>

      {/* Time block */}
      <section style={{
        background: "var(--card)",
        border: "0.5px solid var(--line)",
        borderRadius: 18,
        padding: 18,
        marginBottom: 14,
        display: "grid",
        gap: 14,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-2)" }}>
          <Calendar size={14} />
          <span style={{ fontFamily: "var(--serif)", fontSize: 20 }}>{dateLabel}</span>
        </div>
        <Mono style={{ fontSize: 24, fontWeight: 500, color: "var(--ink)" }}>{timeRange}</Mono>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 }}>
          <Stat label={t("duration")} value={durationLabel} />
          <Stat label={t("distance")} value={distanceLabel ?? "—"} />
        </div>
      </section>

      {/* Location card */}
      <section style={{
        background: "var(--card)",
        border: "0.5px solid var(--line)",
        borderRadius: 18,
        padding: 18,
        marginBottom: 14,
        display: "grid",
        gap: 6,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-3)" }}>
          <MapPin size={14} />
          <Eyebrow>{t("location")}</Eyebrow>
        </div>
        <div style={{ fontFamily: "var(--serif)", fontSize: 18, color: "var(--ink)" }}>
          {locationLabel(request)}
        </div>
        {request.location_name && (
          <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{request.location_name}</div>
        )}
      </section>

      {/* Why you'll match */}
      {eligibility && eligibility.reasons.length > 0 && (
        <section style={{
          background: "var(--card)",
          border: "0.5px solid var(--line)",
          borderRadius: 18,
          padding: 18,
          marginBottom: 14,
          display: "grid",
          gap: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <Eyebrow>{t("whyMatch")}</Eyebrow>
            <div style={{
              display: "inline-flex",
              alignItems: "baseline",
              gap: 4,
              padding: "4px 10px",
              borderRadius: 999,
              background: eligibility.score >= 80 ? "var(--moss-soft)" : eligibility.score >= 50 ? "var(--sand-soft)" : "var(--rose-soft)",
              color: eligibility.score >= 80 ? "var(--moss)" : eligibility.score >= 50 ? "var(--ink-2)" : "var(--rose)",
            }}>
              <Mono style={{ fontSize: 14, fontWeight: 700 }}>{eligibility.score}</Mono>
              <span style={{ fontSize: 11, fontWeight: 600 }}>%</span>
            </div>
          </div>
          <div>
            {eligibility.reasons.map((reason, i) => (
              <div
                key={`${reason.type}-${i}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 0",
                  borderBottom:
                    i < eligibility.reasons.length - 1
                      ? "0.5px solid var(--line-soft)"
                      : "none",
                }}
              >
                <div style={{
                  width: 22,
                  height: 22,
                  borderRadius: 99,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: reason.status === "matched" ? "var(--moss-soft)" : "var(--rose-soft)",
                  color: reason.status === "matched" ? "var(--moss)" : "var(--rose)",
                }}>
                  {reason.status === "matched" ? <Check size={12} strokeWidth={2.5} /> : <X size={12} strokeWidth={2.5} />}
                </div>
                <span style={{ fontSize: 13, color: "var(--ink)" }}>{reason.label}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* State notices */}
      {isFilled && !isAutoReplacement && (
        <Notice tone="muted">{t("filled")}</Notice>
      )}
      {alreadyAccepted && !isFilled && (
        <Notice tone="moss">{t("alreadyAccepted")}</Notice>
      )}
      {alreadyDeclined && !isFilled && (
        <Notice tone="muted">{t("alreadyDeclined")}</Notice>
      )}

      {/* Self-serve replacement — race / won / lost (§3) */}
      {canClaim && (
        <div style={{
          margin: "0 0 8px",
          padding: "10px 14px",
          borderRadius: 12,
          background: "var(--terra-soft)",
          color: "var(--terra-ink)",
          fontSize: 13,
          fontWeight: 600,
        }}>
          {t("replacementRace")}
        </div>
      )}
      {isAutoReplacement && wonByMe && (
        <Notice tone="moss">{t("replacementWon")}</Notice>
      )}
      {isAutoReplacement && (lost || (isFilled && !wonByMe)) && (
        <Notice tone="muted">{t("replacementLost")}</Notice>
      )}

      {error && (
        <p style={{ margin: "8px 0 0", color: "var(--rose)", fontWeight: 600, fontSize: 13 }}>{error}</p>
      )}

      {/* Sticky footer CTAs */}
      {showCtas && (
        <div style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 64,
          padding: "12px 16px",
          background: "var(--paper)",
          borderTop: "0.5px solid var(--line)",
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: 10,
          maxWidth: 480,
          margin: "0 auto",
        }}>
          <button
            type="button"
            onClick={() => setDeclineModalOpen(true)}
            disabled={busy}
            style={{
              border: "0.5px solid var(--line)",
              borderRadius: 12,
              padding: "13px 18px",
              background: "transparent",
              color: "var(--ink)",
              fontSize: 14,
              fontWeight: 600,
              cursor: busy ? "wait" : "pointer",
              opacity: busy ? 0.5 : 1,
              fontFamily: "inherit",
              minHeight: 44,
            }}
          >
            {t("cant")}
          </button>
          <button
            type="button"
            onClick={handleAccept}
            disabled={busy}
            style={{
              border: "none",
              borderRadius: 12,
              padding: "13px 18px",
              background: "var(--terra)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: busy ? "wait" : "pointer",
              opacity: busy ? 0.5 : 1,
              fontFamily: "inherit",
              minHeight: 44,
            }}
          >
            {t("iCanTakeIt")}
          </button>
        </div>
      )}

      {/* Self-serve replacement — single claim CTA (§3) */}
      {canClaim && (
        <div style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 64,
          padding: "12px 16px",
          background: "var(--paper)",
          borderTop: "0.5px solid var(--line)",
          maxWidth: 480,
          margin: "0 auto",
        }}>
          <button
            type="button"
            onClick={handleClaim}
            disabled={busy}
            style={{
              width: "100%",
              border: "none",
              borderRadius: 12,
              padding: "14px 18px",
              background: "var(--terra)",
              color: "#fff",
              fontSize: 15,
              fontWeight: 700,
              cursor: busy ? "wait" : "pointer",
              opacity: busy ? 0.5 : 1,
              fontFamily: "inherit",
              minHeight: 48,
            }}
          >
            {busy ? t("claiming") : t("claimCta")}
          </button>
        </div>
      )}

      {declineModalOpen && (
        <DeclineModal
          reason={declineReason}
          notes={declineNotes}
          busy={busy}
          onReasonChange={setDeclineReason}
          onNotesChange={setDeclineNotes}
          onClose={() => setDeclineModalOpen(false)}
          onConfirm={() => {
            setDeclineModalOpen(false);
            handleDecline();
          }}
          t={t}
        />
      )}
    </div>
  );
}

const DECLINE_REASON_KEYS = ["unavailable", "tooFar", "notQualified", "other"] as const;

function DeclineModal({
  reason,
  notes,
  busy,
  onReasonChange,
  onNotesChange,
  onClose,
  onConfirm,
  t,
}: {
  reason: string;
  notes: string;
  busy: boolean;
  onReasonChange: (v: string) => void;
  onNotesChange: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(21, 20, 15, 0.4)",
        display: "grid",
        placeItems: "end center",
        padding: 12,
      }}
      onClick={onClose}
    >
      <section
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          background: "var(--paper)",
          borderRadius: 22,
          padding: 22,
          display: "grid",
          gap: 16,
          boxShadow: "0 24px 60px rgba(21, 20, 15, 0.25)",
        }}
      >
        <header>
          <h2 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 22, lineHeight: 1.15 }}>
            {t("declineTitle")}
          </h2>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
            {t("declineSub")}
          </p>
        </header>

        <div style={{ display: "grid", gap: 8 }}>
          {DECLINE_REASON_KEYS.map((key) => {
            const label = t(`declineReason.${key}`);
            const on = reason === label;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onReasonChange(label)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 16px", borderRadius: 12,
                  border: on ? "1px solid var(--terra)" : "0.5px solid var(--line)",
                  background: on ? "var(--terra-soft)" : "var(--card)",
                  color: "var(--ink)",
                  cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 500,
                  minHeight: 44, textAlign: "left",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={3}
          placeholder={t("declineNotesPlaceholder")}
          style={{
            borderRadius: 12,
            border: "0.5px solid var(--line)",
            padding: "12px 14px",
            background: "#fff",
            color: "var(--ink)",
            font: "inherit",
            resize: "vertical",
          }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              border: "0.5px solid var(--line)",
              background: "transparent",
              borderRadius: 12,
              padding: "12px 18px",
              color: "var(--ink)",
              fontFamily: "inherit",
              fontSize: 14,
              fontWeight: 600,
              cursor: busy ? "wait" : "pointer",
              minHeight: 44,
            }}
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || !reason}
            style={{
              border: 0,
              borderRadius: 12,
              padding: "12px 18px",
              background: reason && !busy ? "var(--rose)" : "var(--ink-4)",
              color: "var(--paper)",
              fontFamily: "inherit",
              fontSize: 14,
              fontWeight: 600,
              cursor: reason && !busy ? "pointer" : "not-allowed",
              minHeight: 44,
            }}
          >
            {busy ? t("decliningProgress") : t("declineConfirm")}
          </button>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: "10px 12px",
      background: "var(--paper-2)",
      borderRadius: 12,
    }}>
      <div style={{
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: ".14em",
        color: "var(--ink-3)",
        fontWeight: 600,
      }}>
        {label}
      </div>
      <Mono style={{ fontSize: 18, fontWeight: 500, marginTop: 4, display: "block" }}>{value}</Mono>
    </div>
  );
}

function Notice({ tone, children }: { tone: "moss" | "muted"; children: React.ReactNode }) {
  const palette = tone === "moss"
    ? { bg: "var(--moss-soft)", color: "var(--moss)", border: "#C8DCC1" }
    : { bg: "var(--paper-2)", color: "var(--ink-2)", border: "var(--line)" };
  return (
    <div style={{
      background: palette.bg,
      color: palette.color,
      border: `0.5px solid ${palette.border}`,
      borderRadius: 12,
      padding: "12px 14px",
      fontSize: 13,
      fontWeight: 500,
    }}>
      {children}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "48px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>
      {children}
    </div>
  );
}

function computeDuration(start: string, end: string): string {
  const [sh, sm] = start.slice(0, 5).split(":").map(Number);
  const [eh, em] = end.slice(0, 5).split(":").map(Number);
  let minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes < 0) minutes += 24 * 60;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${String(mins).padStart(2, "0")}`;
}
