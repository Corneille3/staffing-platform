"use client";

import { useRouter } from "next/navigation";
import { CSSProperties, FormEvent, useState, useTransition } from "react";
import { removeUserByEmail } from "../lib/browser-api";

export function OrphanUserCleanup() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      const removed = await removeUserByEmail(email.trim());
      setSuccess(
        `Removed ${email.trim()} (DB row tombstoned, Clerk identity deleted, all memberships deactivated). The original email is now free for re-invitation.`,
      );
      setEmail("");
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cleanup failed");
    }
  }

  const summaryStyle: CSSProperties = {
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    opacity: 0.7,
    padding: "10px 14px",
    borderRadius: 999,
    background: "rgba(247,240,223,0.04)",
    display: "inline-block",
  };

  const labelStyle: CSSProperties = {
    display: "grid",
    gap: 6,
    color: "#cdd9c8",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  };

  const inputStyle: CSSProperties = {
    borderRadius: 10,
    border: "1px solid rgba(247,240,223,0.18)",
    padding: "10px 12px",
    background: "rgba(247,240,223,0.06)",
    color: "#f3ead4",
    font: "inherit",
    fontSize: 14,
  };

  return (
    <section style={{ marginTop: 36 }}>
      <details onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary style={summaryStyle}>
          {open ? "▾" : "▸"} Force-remove orphan user
        </summary>

        <div
          style={{
            marginTop: 14,
            padding: 18,
            borderRadius: 14,
            background: "rgba(247,240,223,0.04)",
            border: "1px solid rgba(247,240,223,0.08)",
            maxWidth: 540,
          }}
        >
          <p style={{ margin: "0 0 14px", fontSize: 13, opacity: 0.72, lineHeight: 1.5 }}>
            Cleanup tool for accounts whose email is bound in the database
            but who don&apos;t appear in any management list. Typically a
            leftover from an older JIT-create flow on sign-in. Removing
            here tombstones the DB row, deletes the Clerk identity, and
            frees the email for re-invitation.
          </p>

          <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
            <label style={labelStyle}>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                required
                style={inputStyle}
              />
            </label>

            {error ? (
              <p
                style={{
                  margin: 0,
                  color: "#ffb1a0",
                  background: "rgba(140,63,50,0.25)",
                  padding: "8px 12px",
                  borderRadius: 10,
                  fontSize: 13,
                }}
              >
                {error}
              </p>
            ) : null}

            {success ? (
              <p
                style={{
                  margin: 0,
                  color: "#a4d8a3",
                  background: "rgba(60,120,60,0.18)",
                  padding: "8px 12px",
                  borderRadius: 10,
                  fontSize: 13,
                  lineHeight: 1.45,
                }}
              >
                {success}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isPending || !email.trim()}
              style={{
                background: "#7a473f",
                border: 0,
                color: "#f7f0df",
                padding: "10px 18px",
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                cursor: isPending || !email.trim() ? "not-allowed" : "pointer",
                justifySelf: "start",
              }}
            >
              {isPending ? "Removing…" : "Force remove"}
            </button>
          </form>
        </div>
      </details>
    </section>
  );
}
