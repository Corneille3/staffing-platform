"use client";

import { useRouter } from "next/navigation";
import { CSSProperties, FormEvent, useState, useTransition } from "react";
import { Eyebrow } from "../../../../../components/ui";
import { createNetwork } from "../../../../../lib/browser-api";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  color: "var(--ink-3)",
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
};

const inputStyle: CSSProperties = {
  borderRadius: "var(--r-sm)",
  border: "0.5px solid var(--line)",
  padding: "11px 12px",
  background: "var(--card)",
  color: "var(--ink)",
  font: "inherit",
  fontSize: 14,
  minWidth: 0,
  fontFamily: "var(--ui)",
  outline: "none",
};

const PRIMARY_BTN: CSSProperties = {
  background: "var(--terra)",
  border: 0,
  color: "var(--paper)",
  padding: "12px 22px",
  borderRadius: 999,
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
};

const SECONDARY_BTN: CSSProperties = {
  background: "transparent",
  border: "0.5px solid var(--line)",
  color: "var(--ink)",
  padding: "12px 22px",
  borderRadius: 999,
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
};

export default function NewNetworkPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [adminFirstName, setAdminFirstName] = useState("");
  const [adminLastName, setAdminLastName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [adminLang, setAdminLang] = useState("fr");

  function onNameChange(value: string) {
    setName(value);
    if (!slugManuallyEdited) setSlug(slugify(value));
  }

  function onSlugChange(value: string) {
    setSlug(value);
    setSlugManuallyEdited(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const network = await createNetwork({
        name: name.trim(),
        slug: slug.trim(),
        admin_first_name: adminFirstName.trim(),
        admin_last_name: adminLastName.trim(),
        admin_email: adminEmail.trim(),
        admin_phone: adminPhone.trim() || undefined,
        admin_preferred_language: adminLang,
      });
      startTransition(() => {
        router.push(`/apf/networks?created=${encodeURIComponent(network.slug)}`);
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create network");
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 0" }}>
      <Eyebrow style={{ marginBottom: 12 }}>Platform Management</Eyebrow>
      <h1
        style={{
          margin: 0,
          fontFamily: "var(--serif)",
          fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)",
          lineHeight: 1.1,
          fontWeight: 400,
          color: "var(--ink)",
        }}
      >
        Add a new <em style={{ fontStyle: "italic" }}>network</em>
      </h1>
      <p style={{ margin: "12px 0 28px", color: "var(--ink-2)", lineHeight: 1.55, maxWidth: 580, fontSize: 15 }}>
        Creates a new tenant and provisions its first network admin. The admin signs up at{" "}
        <code style={{ fontFamily: "var(--mono)", fontSize: 13 }}>staffig.kouamvision.com/sign-up</code> with the email below; sign-in links the
        Clerk identity to the DB row and they land on their tenant&apos;s{" "}
        <code style={{ fontFamily: "var(--mono)", fontSize: 13 }}>/apf</code>.
      </p>

      <form onSubmit={submit} style={{ display: "grid", gap: 18 }}>
        <fieldset
          style={{
            border: "0.5px solid var(--line)",
            borderRadius: "var(--r-lg)",
            padding: 20,
            display: "grid",
            gap: 14,
            background: "var(--card)",
          }}
        >
          <legend
            style={{
              padding: "0 8px",
              fontSize: 11,
              color: "var(--ink-3)",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            Network
          </legend>
          <label style={labelStyle}>
            Business name
            <input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Acme Daycare Network"
              style={inputStyle}
              required
            />
          </label>
          <label style={labelStyle}>
            Slug
            <input
              value={slug}
              onChange={(e) => onSlugChange(e.target.value)}
              placeholder="acme-daycare"
              style={inputStyle}
              required
              pattern="[a-z0-9][a-z0-9-]*[a-z0-9]"
              title="Lowercase letters, digits, and hyphens; must start and end with letter/digit"
            />
            <span
              style={{
                fontSize: 11,
                color: "var(--ink-3)",
                fontWeight: 400,
                textTransform: "none",
                letterSpacing: "normal",
              }}
            >
              Used internally as a stable identifier. Auto-derived from the name; edit if needed.
            </span>
          </label>
        </fieldset>

        <fieldset
          style={{
            border: "0.5px solid var(--line)",
            borderRadius: "var(--r-lg)",
            padding: 20,
            display: "grid",
            gap: 14,
            background: "var(--card)",
          }}
        >
          <legend
            style={{
              padding: "0 8px",
              fontSize: 11,
              color: "var(--ink-3)",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            First network admin
          </legend>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={labelStyle}>
              First name
              <input
                value={adminFirstName}
                onChange={(e) => setAdminFirstName(e.target.value)}
                style={inputStyle}
                required
              />
            </label>
            <label style={labelStyle}>
              Last name
              <input
                value={adminLastName}
                onChange={(e) => setAdminLastName(e.target.value)}
                style={inputStyle}
                required
              />
            </label>
          </div>
          <label style={labelStyle}>
            Email
            <input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="admin@acme.example"
              style={inputStyle}
              required
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={labelStyle}>
              Phone (optional)
              <input
                type="tel"
                value={adminPhone}
                onChange={(e) => setAdminPhone(e.target.value)}
                placeholder="+1 514 555 0100"
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Preferred language
              <select
                value={adminLang}
                onChange={(e) => setAdminLang(e.target.value)}
                style={inputStyle}
              >
                <option value="fr">French</option>
                <option value="en">English</option>
                <option value="bilingual">Bilingual</option>
              </select>
            </label>
          </div>
        </fieldset>

        {error ? (
          <p
            style={{
              margin: 0,
              color: "var(--rose)",
              background: "var(--rose-soft)",
              padding: "10px 14px",
              borderRadius: "var(--r-sm)",
              fontSize: 13,
              border: "0.5px solid var(--rose)",
            }}
          >
            {error}
          </p>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <button
            type="button"
            onClick={() => router.push("/apf/networks")}
            disabled={isPending}
            style={{ ...SECONDARY_BTN, cursor: isPending ? "not-allowed" : "pointer" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            style={{ ...PRIMARY_BTN, cursor: isPending ? "not-allowed" : "pointer", opacity: isPending ? 0.6 : 1 }}
          >
            {isPending ? "Creating…" : "Create network"}
          </button>
        </div>
      </form>
    </div>
  );
}
