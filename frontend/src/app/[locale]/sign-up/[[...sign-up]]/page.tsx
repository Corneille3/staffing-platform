import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--paper)",
        fontFamily: "var(--ui)",
        display: "flex",
        padding: 36,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Logo */}
      <div
        style={{
          position: "absolute",
          top: 24,
          left: 28,
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: "var(--ink)",
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: "var(--terra)",
          }}
        />
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>
          Staffig
        </span>
      </div>

      {/* Center */}
      <div style={{ margin: "auto", width: 380 }}>
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
          You were invited
        </div>
        <h1
          style={{
            fontFamily: "var(--serif)",
            fontSize: 46,
            lineHeight: 1.05,
            margin: "0 0 8px",
          }}
        >
          Create your <em style={{ fontStyle: "italic" }}>account</em>
        </h1>
        <p
          style={{
            margin: "0 0 26px",
            color: "var(--ink-2)",
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          Use the same email address your coordinator invited you with — it
          links your account automatically.
        </p>
        <SignUp signInUrl="/sign-in" />
      </div>

      {/* Language toggle */}
      <div
        style={{
          position: "absolute",
          bottom: 32,
          left: 28,
          fontSize: 11,
          color: "var(--ink-3)",
        }}
      >
        EN · <span style={{ textDecoration: "underline", cursor: "pointer" }}>FR</span>
      </div>

      {/* Decorative circles */}
      <svg
        style={{ position: "absolute", right: -100, bottom: -80, pointerEvents: "none" }}
        width="380"
        height="380"
        viewBox="0 0 200 200"
        fill="none"
      >
        <circle cx="100" cy="100" r="90" stroke="#DC5A2A" strokeWidth=".6" strokeDasharray="2 3" />
        <circle cx="100" cy="100" r="60" stroke="#15140F" strokeWidth=".6" />
        <circle cx="100" cy="100" r="4" fill="#DC5A2A" />
      </svg>
    </div>
  );
}
