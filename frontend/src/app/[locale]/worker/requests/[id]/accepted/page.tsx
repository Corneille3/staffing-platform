"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Check, Circle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "../../../../../../i18n/navigation";
import {
  cancelRelease,
  fetchReplacementStatus,
  fetchRequest,
  fetchRequestResponses,
  releaseShift,
  withdrawRequest,
  type ReplacementStatus,
} from "../../../../../../lib/browser-api";
import { formatWorkDate, locationLabel, roleSectorSubtitle } from "../../../../../../lib/format";
import { RequestResponse, StaffingRequest } from "../../../../../../lib/types";
import { useWorkerSession } from "../../../../../../lib/worker-session";
import { Eyebrow, Mono } from "../../../../../../components/ui";

type TimelineNodeState = "done" | "current" | "pending";

export default function WorkerRequestAcceptedPage() {
  const { worker } = useWorkerSession();
  const params = useParams<{ id: string }>();
  const requestId = params?.id;
  const router = useRouter();
  const locale = useLocale() as "fr" | "en";
  const t = useTranslations("worker.requestAccepted");

  const [request, setRequest] = useState<StaffingRequest | null>(null);
  const [myResponse, setMyResponse] = useState<RequestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Self-serve replacement (§2): the release sheet + the broadcast result.
  const [releaseSheet, setReleaseSheet] = useState(false);
  const [releaseReason, setReleaseReason] = useState<"sick" | "family" | "personal" | "other">("sick");
  const [released, setReleased] = useState(false);
  const [replacementId, setReplacementId] = useState<string | null>(null);
  const [replStatus, setReplStatus] = useState<ReplacementStatus | null>(null);

  useEffect(() => {
    if (!worker || !requestId) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [req, responses] = await Promise.all([
          fetchRequest(requestId),
          fetchRequestResponses(requestId).catch(() => [] as RequestResponse[]),
        ]);
        if (!alive) return;
        setRequest(req);
        setMyResponse(responses.find((r) => r.worker_user_id === worker.id) ?? null);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [worker, requestId]);

  // Poll the release status while waiting for a claim (no realtime — §1 polling
  // enhancement). Stops once it's filled.
  useEffect(() => {
    if (!released || !replacementId || replStatus?.filled) return;
    let alive = true;
    const poll = async () => {
      try {
        const s = await fetchReplacementStatus(replacementId);
        if (alive) setReplStatus(s);
      } catch {
        /* transient — keep polling */
      }
    };
    void poll();
    const interval = setInterval(poll, 5000);
    return () => { alive = false; clearInterval(interval); };
  }, [released, replacementId, replStatus?.filled]);

  if (!worker) return null;

  if (loading) {
    return <Centered>{t("loading")}</Centered>;
  }

  if (error || !request) {
    return <Centered>{error ?? t("notFound")}</Centered>;
  }

  // A withdrawn response means the giver either withdrew their acceptance or
  // released this shift and someone filled it (Finding #1 hand-off) — in both
  // cases it's no longer theirs, so it must not read as an assigned held shift.
  const withdrawn = myResponse?.status === "withdrawn";
  const isAssignedToMe =
    request.status === "assigned" &&
    request.assigned_worker_user_id === worker.id &&
    !withdrawn;
  const isClosed = ["cancelled", "completed", "expired"].includes(request.status);
  const isShiftStarted = new Date(`${request.work_date}T${request.start_time}`).getTime() <= Date.now();
  const canWithdraw =
    myResponse?.status === "accepted" &&
    !isAssignedToMe &&
    !isClosed;

  // Timeline node states
  const nodeResponseSent: TimelineNodeState = "done";
  const nodeReviewing: TimelineNodeState = isAssignedToMe ? "done" : "current";
  // The coordinator has confirmed the moment we're assigned (assign === confirm
  // in this system), so "Confirmed" greens immediately. "Shift starts" then
  // becomes the active node we're waiting on, and greens once the shift begins.
  const nodeConfirmed: TimelineNodeState = isAssignedToMe ? "done" : "pending";
  const nodeShiftStarts: TimelineNodeState = isAssignedToMe
    ? (isShiftStarted ? "done" : "current")
    : "pending";

  const subtitle = roleSectorSubtitle(request, locale);
  const dateLabel = formatWorkDate(request.work_date, locale);
  const timeRange = `${request.start_time.slice(0, 5)} → ${request.end_time.slice(0, 5)}`;

  async function handleWithdraw() {
    if (!worker || !request) return;
    setBusy(true);
    setError(null);
    try {
      await withdrawRequest(request.id, worker.id);
      router.push("/worker");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdraw failed");
      setBusy(false);
    }
  }

  async function handleRelease() {
    if (!request) return;
    setBusy(true);
    setError(null);
    try {
      const replacement = await releaseShift(request.id, releaseReason);
      setReplacementId(replacement.id);
      setReleased(true);
      setReleaseSheet(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Release failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelRelease() {
    if (!replacementId) return;
    setBusy(true);
    setError(null);
    try {
      await cancelRelease(replacementId);
      setReleased(false);
      setReplacementId(null);
      setReplStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  }

  // You can release a held shift that hasn't started yet (§2).
  const canRelease = isAssignedToMe && !isShiftStarted && !isClosed && !released;
  const replFilled = replStatus?.filled === true;

  return (
    <div style={{ paddingBottom: 32 }}>
      {/* Header */}
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

      {/* Success hero (moss) — hidden after withdrawal */}
      {!withdrawn && (
      <section style={{
        background: "var(--moss)",
        color: "var(--paper)",
        borderRadius: 22,
        padding: 22,
        marginBottom: 16,
        position: "relative",
        overflow: "hidden",
      }}>
        <svg
          style={{ position: "absolute", right: -30, top: -30, opacity: 0.15 }}
          width="160"
          height="160"
          viewBox="0 0 200 200"
        >
          <circle cx="100" cy="100" r="80" stroke="#fff" strokeWidth="1" fill="none" />
          <circle cx="100" cy="100" r="40" stroke="#fff" strokeWidth="1" fill="none" />
        </svg>

        <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 30, lineHeight: 1.05 }}>
          {t("successPre")} <em style={{ fontStyle: "italic" }}>{t("successAccent")}</em>
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 13, opacity: 0.85, lineHeight: 1.5 }}>
          {t("successSub")}
        </p>

        <div style={{ marginTop: 18, borderTop: "0.5px solid rgba(255,255,255,.2)", paddingTop: 14 }}>
          <div style={{ fontFamily: "var(--serif)", fontSize: 20, lineHeight: 1.15 }}>
            {request.organization?.name ?? request.title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{subtitle}</div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, opacity: 0.85 }}>
            <span style={{ fontFamily: "var(--serif)", fontSize: 15 }}>{dateLabel}</span>
            <span>·</span>
            <Mono style={{ fontSize: 14 }}>{timeRange}</Mono>
          </div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>{locationLabel(request)}</div>
        </div>
      </section>
      )}

      {/* Timeline */}
      <section style={{
        background: "var(--card)",
        border: "0.5px solid var(--line)",
        borderRadius: 18,
        padding: 18,
        marginBottom: 16,
      }}>
        <Eyebrow style={{ marginBottom: 14 }}>{t("timelineResponseSent").toUpperCase()}</Eyebrow>
        <Timeline
          nodes={[
            { label: t("timelineResponseSent"), state: nodeResponseSent },
            { label: t("timelineReviewing"),    state: nodeReviewing },
            { label: t("timelineConfirmed"),    state: nodeConfirmed },
            { label: t("timelineShiftStarts"),  state: nodeShiftStarts },
          ]}
        />
      </section>

      {/* State notices */}
      {withdrawn && (
        <Notice tone="muted">{t("withdrawn")}</Notice>
      )}
      {isAssignedToMe && !canWithdraw && !withdrawn && (
        <Notice tone="moss">{t("alreadyAssigned")}</Notice>
      )}

      {error && (
        <p style={{ margin: "8px 0 0", color: "var(--rose)", fontWeight: 600, fontSize: 13 }}>{error}</p>
      )}

      {/* Self-serve replacement — waiting / filled (§6 ReplacementWaiting) */}
      {released && replFilled && (
        <Notice tone="moss">
          {t("replFilled", { name: replStatus?.claimed_by_name ?? t("replSomeone") })}
        </Notice>
      )}
      {released && !replFilled && (
        <section style={{
          background: "var(--card)",
          border: "0.5px solid var(--line)",
          borderRadius: 18,
          padding: 18,
          marginBottom: 8,
        }}>
          <div style={{ fontFamily: "var(--serif)", fontSize: 18, marginBottom: 4 }}>
            {t("replWaitingTitle")}
          </div>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
            {t("replWaitingSub")}
          </p>
          <div style={{ display: "flex", gap: 18, marginBottom: 14 }}>
            <Tally value={replStatus?.alerted ?? 0} label={t("replAlerted")} />
            <Tally value={replStatus?.viewed ?? 0} label={t("replViewed")} />
          </div>
          <button
            type="button"
            onClick={handleCancelRelease}
            disabled={busy}
            style={{
              width: "100%", minHeight: 44, borderRadius: 14,
              border: "0.5px solid var(--line)", background: "transparent",
              color: "var(--ink-2)", fontSize: 14, fontWeight: 600,
              cursor: busy ? "wait" : "pointer", fontFamily: "inherit",
            }}
          >
            {t("replCancel")}
          </button>
        </section>
      )}

      {/* Self-serve replacement — trigger + confirm sheet (§2) */}
      {canRelease && !releaseSheet && (
        <button
          type="button"
          onClick={() => setReleaseSheet(true)}
          style={{
            width: "100%",
            marginTop: 8,
            border: "0.5px solid var(--terra)",
            borderRadius: 14,
            padding: "14px 18px",
            background: "transparent",
            color: "var(--terra)",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            minHeight: 44,
          }}
        >
          {t("releaseCta")}
        </button>
      )}

      {canRelease && releaseSheet && (
        <section style={{
          marginTop: 8,
          background: "var(--card)",
          border: "0.5px solid var(--line)",
          borderRadius: 18,
          padding: 18,
        }}>
          <div style={{ fontFamily: "var(--serif)", fontSize: 18, marginBottom: 4 }}>
            {t("releaseSheetTitle")}
          </div>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
            {t("releaseSheetSub")}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {(["sick", "family", "personal", "other"] as const).map((r) => {
              const active = releaseReason === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReleaseReason(r)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 99,
                    border: `0.5px solid ${active ? "transparent" : "var(--line)"}`,
                    background: active ? "var(--ink)" : "#fff",
                    color: active ? "var(--paper)" : "var(--ink)",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    minHeight: 40,
                  }}
                >
                  {t(`reason_${r}`)}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={() => setReleaseSheet(false)}
              disabled={busy}
              style={{
                flex: 1, minHeight: 44, borderRadius: 14, border: "0.5px solid var(--line)",
                background: "transparent", color: "var(--ink-2)", fontSize: 14, fontWeight: 600,
                cursor: busy ? "wait" : "pointer", fontFamily: "inherit",
              }}
            >
              {t("releaseCancel")}
            </button>
            <button
              type="button"
              onClick={handleRelease}
              disabled={busy}
              style={{
                flex: 1, minHeight: 44, borderRadius: 14, border: "none",
                background: "var(--terra)", color: "#fff", fontSize: 14, fontWeight: 600,
                cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1, fontFamily: "inherit",
              }}
            >
              {busy ? t("releaseBusy") : t("releaseConfirm")}
            </button>
          </div>
        </section>
      )}

      {/* Withdraw */}
      {canWithdraw && (
        <button
          type="button"
          onClick={handleWithdraw}
          disabled={busy}
          style={{
            width: "100%",
            marginTop: 8,
            border: "0.5px solid var(--line)",
            borderRadius: 14,
            padding: "14px 18px",
            background: "transparent",
            color: "var(--rose)",
            fontSize: 14,
            fontWeight: 600,
            cursor: busy ? "wait" : "pointer",
            opacity: busy ? 0.5 : 1,
            fontFamily: "inherit",
            minHeight: 44,
          }}
        >
          {busy ? t("withdrawing") : t("withdraw")}
        </button>
      )}
    </div>
  );
}

function Timeline({ nodes }: { nodes: { label: string; state: TimelineNodeState }[] }) {
  return (
    <div>
      {nodes.map((node, i) => {
        const isLast = i === nodes.length - 1;
        const colors =
          node.state === "done"
            ? { ring: "var(--moss)", fill: "var(--moss)", icon: "#fff", text: "var(--ink)" }
            : node.state === "current"
              ? { ring: "var(--terra)", fill: "var(--terra-soft)", icon: "var(--terra)", text: "var(--ink)" }
              : { ring: "var(--line)", fill: "transparent", icon: "var(--ink-4)", text: "var(--ink-3)" };
        return (
          <div key={node.label} style={{ display: "flex", gap: 12, position: "relative" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{
                width: 22,
                height: 22,
                borderRadius: 99,
                border: `1.5px solid ${colors.ring}`,
                background: colors.fill,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: colors.icon,
                flexShrink: 0,
                zIndex: 1,
              }}>
                {node.state === "done"
                  ? <Check size={12} strokeWidth={2.5} />
                  : node.state === "current"
                    ? <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--terra)" }} />
                    : <Circle size={6} strokeWidth={0} fill="var(--ink-4)" />}
              </div>
              {!isLast && (
                <div style={{
                  width: 1,
                  flex: 1,
                  background: node.state === "done" ? "var(--moss)" : "var(--line)",
                  minHeight: 24,
                  marginTop: 2,
                  marginBottom: 2,
                }} />
              )}
            </div>
            <div style={{
              paddingTop: 2,
              paddingBottom: isLast ? 0 : 20,
              fontSize: 14,
              fontWeight: node.state === "current" ? 600 : 500,
              color: colors.text,
            }}>
              {node.label}
            </div>
          </div>
        );
      })}
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

function Tally({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <Mono style={{ fontSize: 24, fontWeight: 600 }}>{value}</Mono>
      <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{label}</div>
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
