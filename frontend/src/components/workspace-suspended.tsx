import { PauseCircle } from "lucide-react";
import { HeaderSignOutButton } from "./header-sign-out-button";

/** Full-page lockout shown to a suspended tenant's users (the backend
 * rejects every tenant-scoped request with 403 — this is the friendly
 * face of that). Platform operators never see this: their scope drops
 * the tenant instead, so they can still reach /platform to reactivate. */
export function WorkspaceSuspendedScreen() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--paper)",
        color: "var(--ink)",
        fontFamily: "var(--ui)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 36,
      }}
    >
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <div
          style={{
            width: 56,
            height: 56,
            margin: "0 auto 18px",
            borderRadius: "50%",
            background: "var(--sand-soft, rgba(232,201,122,.2))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <PauseCircle size={26} style={{ color: "#8C6B14" }} />
        </div>
        <div
          style={{
            fontSize: 10,
            letterSpacing: ".14em",
            textTransform: "uppercase",
            fontWeight: 500,
            color: "var(--ink-3)",
            marginBottom: 10,
          }}
        >
          Workspace paused
        </div>
        <h1
          style={{
            fontFamily: "var(--serif)",
            fontSize: 34,
            lineHeight: 1.1,
            margin: "0 0 10px",
          }}
        >
          This workspace is <em style={{ fontStyle: "italic" }}>suspended</em>
        </h1>
        <p style={{ margin: "0 0 24px", color: "var(--ink-2)", fontSize: 14, lineHeight: 1.55 }}>
          Your network&apos;s access to Staffig has been paused by the platform
          operator. Your data is safe and nothing has been deleted — access
          returns the moment the workspace is reactivated. If you believe this
          is a mistake, contact your platform operator.
        </p>
        <HeaderSignOutButton />
      </div>
    </div>
  );
}
