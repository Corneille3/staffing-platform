import Link from "next/link";

export default function NotInvitedPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, #f4efe2 0%, #ebe5d8 24%, #d8d7cb 52%, #bcc9c2 100%)",
        color: "#183229",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 520,
          textAlign: "center",
          background: "rgba(255, 253, 247, 0.85)",
          borderRadius: 24,
          padding: "40px 32px",
          boxShadow: "0 18px 48px rgba(24, 50, 41, 0.16)",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 12,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "#5d6d66",
          }}
        >
          STAFFIG PLATFORM
        </p>
        <h1 style={{ margin: "10px 0 12px", fontSize: 30 }}>
          Account not invited
        </h1>
        <p
          style={{
            margin: "0 0 22px",
            fontSize: 16,
            lineHeight: 1.55,
            color: "#3d564c",
          }}
        >
          The email you just signed in with is not associated with a Staffig
          account. Access is granted by invitation only — please contact your
          network administrator to be added, or sign in with a different
          email.
        </p>
        <p
          style={{
            margin: "0 0 22px",
            fontSize: 14,
            lineHeight: 1.55,
            color: "#5d6d66",
          }}
        >
          Le courriel utilisé pour vous connecter n&apos;est pas associé à un
          compte Staffig. L&apos;accès est sur invitation seulement —
          communiquez avec votre administrateur réseau, ou connectez-vous
          avec un autre courriel.
        </p>
        <Link
          href="/sign-in"
          style={{
            display: "inline-block",
            background: "#183229",
            color: "#f7f0df",
            textDecoration: "none",
            padding: "12px 22px",
            borderRadius: 999,
            fontWeight: 800,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            fontSize: 13,
          }}
        >
          Try a different email
        </Link>
      </div>
    </div>
  );
}
