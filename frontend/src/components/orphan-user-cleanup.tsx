"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
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
      await removeUserByEmail(email.trim());
      setSuccess(
        `Removed ${email.trim()} — DB row tombstoned, Clerk identity deleted, all memberships deactivated. The address is free for re-invitation.`,
      );
      setEmail("");
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cleanup failed");
    }
  }

  return (
    <section style={{ marginTop: 28 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          padding: "7px 14px",
          borderRadius: 999,
          border: "0.5px solid var(--line)",
          background: "transparent",
          fontSize: 12,
          fontWeight: 500,
          color: "var(--ink-2)",
          cursor: "pointer",
          fontFamily: "var(--ui)",
        }}
      >
        <Trash2 size={12} />
        Force-remove orphan user
      </button>

      {open && (
        <div
          style={{
            marginTop: 14,
            padding: "18px 20px",
            background: "var(--card)",
            border: "0.5px solid var(--line)",
            borderRadius: 14,
            maxWidth: 520,
          }}
        >
          <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
            For accounts whose email is bound in the database but don&apos;t
            appear in any management list. Removes the DB row, deletes the
            Clerk identity, and frees the email for re-invitation.
          </p>

          <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
            <label
              style={{
                display: "grid",
                gap: 5,
                fontSize: 10,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                fontWeight: 500,
                color: "var(--ink-3)",
              }}
            >
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                required
                style={{
                  padding: "9px 12px",
                  borderRadius: 10,
                  border: "0.5px solid var(--line)",
                  background: "var(--paper)",
                  color: "var(--ink)",
                  fontSize: 13,
                  fontFamily: "var(--ui)",
                }}
              />
            </label>

            {error && (
              <p
                style={{
                  margin: 0,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "var(--terra-soft)",
                  color: "var(--terra-ink)",
                  fontSize: 12,
                }}
              >
                {error}
              </p>
            )}

            {success && (
              <p
                style={{
                  margin: 0,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "var(--moss-soft)",
                  color: "var(--moss)",
                  fontSize: 12,
                  lineHeight: 1.45,
                }}
              >
                {success}
              </p>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="submit"
                disabled={isPending || !email.trim()}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "9px 18px",
                  borderRadius: 999,
                  background: "var(--rose)",
                  border: "none",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: isPending || !email.trim() ? "not-allowed" : "pointer",
                  opacity: isPending || !email.trim() ? 0.5 : 1,
                  fontFamily: "var(--ui)",
                }}
              >
                <Trash2 size={12} />
                {isPending ? "Removing…" : "Force remove"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
