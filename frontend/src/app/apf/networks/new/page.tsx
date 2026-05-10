"use client";

import { useRouter } from "next/navigation";
import { CSSProperties, FormEvent, useState, useTransition } from "react";
import { createNetwork } from "../../../../lib/browser-api";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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

  const labelStyle: CSSProperties = {
    display: "grid",
    gap: 6,
    color: "#cdd9c8",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  };

  const inputStyle: CSSProperties = {
    borderRadius: 12,
    border: "1px solid rgba(247,240,223,0.18)",
    padding: "11px 12px",
    background: "rgba(247,240,223,0.06)",
    color: "#f3ead4",
    font: "inherit",
    fontSize: 14,
    minWidth: 0,
  };

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px 80px" }}>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          opacity: 0.6,
        }}
      >
        Platform Management
      </p>
      <h1
        style={{
          margin: "10px 0 8px",
          fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)",
          lineHeight: 1.1,
        }}
      >
        Add a new network
      </h1>
      <p style={{ margin: "0 0 28px", opacity: 0.72, lineHeight: 1.55, maxWidth: 580 }}>
        Creates a new tenant and provisions its first network admin. The admin signs up at{" "}
        <code>staffig.kouamvision.com/sign-up</code> with the email below; sign-in links the
        Clerk identity to the DB row and they land on their tenant&apos;s <code>/apf</code>.
      </p>

      <form onSubmit={submit} style={{ display: "grid", gap: 18 }}>
        <fieldset
          style={{
            border: "1px solid rgba(247,240,223,0.12)",
            borderRadius: 18,
            padding: 20,
            display: "grid",
            gap: 14,
          }}
        >
          <legend style={{ padding: "0 8px", fontSize: 12, opacity: 0.7, letterSpacing: "0.08em", textTransform: "uppercase" }}>
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
            <span style={{ fontSize: 11, opacity: 0.55, fontWeight: 400, textTransform: "none" }}>
              Used internally as a stable identifier. Auto-derived from the name; edit if needed.
            </span>
          </label>
        </fieldset>

        <fieldset
          style={{
            border: "1px solid rgba(247,240,223,0.12)",
            borderRadius: 18,
            padding: 20,
            display: "grid",
            gap: 14,
          }}
        >
          <legend style={{ padding: "0 8px", fontSize: 12, opacity: 0.7, letterSpacing: "0.08em", textTransform: "uppercase" }}>
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
              color: "#ffb1a0",
              background: "rgba(140,63,50,0.25)",
              padding: "10px 14px",
              borderRadius: 10,
              fontSize: 13,
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
            style={{
              background: "transparent",
              border: "1px solid rgba(247,240,223,0.3)",
              color: "#f3ead4",
              padding: "12px 22px",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 700,
              cursor: isPending ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            style={{
              background: "#f7f0df",
              border: 0,
              color: "#183229",
              padding: "12px 22px",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              cursor: isPending ? "not-allowed" : "pointer",
            }}
          >
            {isPending ? "Creating…" : "Create network"}
          </button>
        </div>
      </form>
    </main>
  );
}
