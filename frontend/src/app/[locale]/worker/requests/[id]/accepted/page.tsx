"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Check, Circle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "../../../../../../i18n/navigation";
import {
  fetchRequest,
  fetchRequestResponses,
  withdrawRequest,
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

  if (!worker) return null;

  if (loading) {
    return <Centered>{t("loading")}</Centered>;
  }

  if (error || !request) {
    return <Centered>{error ?? t("notFound")}</Centered>;
  }

  const isAssignedToMe =
    request.status === "assigned" && request.assigned_worker_user_id === worker.id;
  const isClosed = ["cancelled", "completed", "expired"].includes(request.status);
  const isShiftStarted = new Date(`${request.work_date}T${request.start_time}`).getTime() <= Date.now();
  const withdrawn = myResponse?.status === "withdrawn";
  const canWithdraw =
    myResponse?.status === "accepted" &&
    !isAssignedToMe &&
    !isClosed;

  // Timeline node states
  const nodeResponseSent: TimelineNodeState = "done";
  const nodeReviewing: TimelineNodeState = isAssignedToMe ? "done" : "current";
  const nodeConfirmed: TimelineNodeState = isAssignedToMe
    ? (isShiftStarted ? "done" : "current")
    : "pending";
  const nodeShiftStarts: TimelineNodeState = isAssignedToMe && isShiftStarted ? "current" : "pending";

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

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "48px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>
      {children}
    </div>
  );
}
