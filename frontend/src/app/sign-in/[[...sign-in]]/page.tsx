import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background:
          "radial-gradient(circle at top, #f4efe2 0%, #ebe5d8 24%, #d8d7cb 52%, #bcc9c2 100%)",
        padding: "40px 20px",
      }}
    >
      <div style={{ display: "grid", gap: 20, justifyItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: "#496158",
            }}
          >
            STAFFIG PLATFORM
          </p>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 12,
              color: "#496158",
              textAlign: "center",
            }}
          >
            by KouamVision
          </p>
          <h1 style={{ margin: "8px 0 0", fontSize: 28 }}>Sign in</h1>
        </div>
        <SignIn signUpUrl="/sign-up" />
      </div>
    </div>
  );
}
