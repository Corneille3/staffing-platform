"use client";

import { useClerk } from "@clerk/nextjs";
import { LogOut, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { avatarTone } from "../../../../lib/avatar-tone";
import { disablePush } from "../../../../lib/push";
import { useWorkerSession } from "../../../../lib/worker-session";
import { useCredentialLabel } from "../../../../hooks/use-credential-label";
import { Avatar, Eyebrow, LanguageSwitcher } from "../../../../components/ui";
import { WorkerPhoneField } from "../../../../components/worker-phone-field";

const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function WorkerProfilePage() {
  const { worker, refresh } = useWorkerSession();
  const t = useTranslations("worker.profile");
  const tCommon = useTranslations("common");
  const credentialLabel = useCredentialLabel();

  if (!worker) return null;

  const initials = `${worker.first_name[0]}${worker.last_name[0]}`.toUpperCase();

  return (
    <div style={{ display: "grid", gap: 24, paddingTop: 16 }}>
      {/* identity header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Avatar initials={initials} tone={avatarTone(`${worker.first_name} ${worker.last_name}`)} size={56} />
        <div>
          <div style={{ fontFamily: "var(--serif)", fontSize: 24, lineHeight: 1.1 }}>
            {worker.first_name}{" "}
            <em style={{ fontStyle: "italic" }}>{worker.last_name}</em>
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>{worker.email}</div>
        </div>
      </div>

      {/* language switcher */}
      <section style={{
        background: "var(--card)",
        border: "0.5px solid var(--line)",
        borderRadius: 18,
        padding: 18,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}>
        <Eyebrow>{t("language")}</Eyebrow>
        <LanguageSwitcher />
      </section>

      {/* identity card */}
      <section style={{
        background: "var(--card)",
        border: "0.5px solid var(--line)",
        borderRadius: 18,
        padding: 18,
        display: "grid",
        gap: 16,
      }}>
        <Eyebrow>{t("identity")}</Eyebrow>
        <Field label={t("firstName")} value={worker.first_name} />
        <Field label={t("lastName")} value={worker.last_name} />
        <Field label={t("email")} value={worker.email} />
        <WorkerPhoneField key={worker.id} initial={worker.phone} onSaved={refresh} />
        <Field
          label={t("languageField")}
          value={worker.preferred_language === "fr" ? "Français" : "English"}
        />
      </section>

      {/* work profile card */}
      <section style={{
        background: "var(--card)",
        border: "0.5px solid var(--line)",
        borderRadius: 18,
        padding: 18,
        display: "grid",
        gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <MapPin size={14} style={{ color: "var(--ink-3)" }} />
          <Eyebrow>{t("workProfile")}</Eyebrow>
        </div>
        <Field
          label={t("cities")}
          value={worker.profile?.supported_cities.join(", ") || "—"}
        />
        <BadgeField
          label={t("qualifications")}
          items={(worker.profile?.qualifications ?? []).map(credentialLabel)}
        />
        <BadgeField
          label={t("certifications")}
          items={(worker.profile?.certifications ?? []).map(credentialLabel)}
        />
        <Field
          label={t("urgentAlerts")}
          value={worker.profile?.urgent_alert_opt_in ? tCommon("on") : tCommon("off")}
        />
      </section>

      {CLERK_ENABLED ? <ClerkSignOutButton label={tCommon("signOut")} workerId={worker.id} /> : <DevSignOutButton label={tCommon("signOut")} />}
    </div>
  );
}

function ClerkSignOutButton({ label, workerId }: { label: string; workerId: string }) {
  const { signOut } = useClerk();
  const locale = useLocale();

  async function handleSignOut() {
    // Drop this device's push subscription so the next person to sign in
    // here does not inherit this account's offers (shared-phone finding).
    await disablePush(workerId).catch(() => undefined);
    window.localStorage.removeItem("apf.workerId");
    window.localStorage.removeItem("apf.devRole");
    await signOut({ redirectUrl: `/${locale}/sign-in` });
  }

  return (
    <button type="button" onClick={handleSignOut} style={signOutStyle}>
      <LogOut size={15} />
      {label}
    </button>
  );
}

function DevSignOutButton({ label }: { label: string }) {
  function handleSignOut() {
    window.localStorage.removeItem("apf.workerId");
    window.location.reload();
  }

  return (
    <button type="button" onClick={handleSignOut} style={signOutStyle}>
      <LogOut size={15} />
      {label}
    </button>
  );
}

const signOutStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  border: "0.5px solid var(--line)",
  borderRadius: 14,
  padding: "14px 18px",
  background: "var(--card)",
  color: "var(--rose)",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  minHeight: 44,
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Eyebrow style={{ fontSize: 9, marginBottom: 4 }}>{label}</Eyebrow>
      <p style={{ margin: 0, fontSize: 15, color: "var(--ink)", fontWeight: 500 }}>{value}</p>
    </div>
  );
}

// Credentials as pill badges (worker-screens plan, étape 5) — one per code,
// wrapping; "—" when the worker has none, like the text fields.
function BadgeField({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <Eyebrow style={{ fontSize: 9, marginBottom: 6 }}>{label}</Eyebrow>
      {items.length === 0 ? (
        <p style={{ margin: 0, fontSize: 15, color: "var(--ink)", fontWeight: 500 }}>—</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {items.map((item) => (
            <span
              key={item}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "5px 11px",
                borderRadius: 999,
                background: "var(--paper-2)",
                border: "0.5px solid var(--line)",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--ink)",
                lineHeight: 1.3,
              }}
            >
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
