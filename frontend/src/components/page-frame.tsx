import { ReactNode } from "react";

export function PageFrame({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main
      style={{
        maxWidth: 1280,
        margin: "0 auto",
        padding: "32px 20px 80px",
      }}
    >
      <section
        style={{
          borderRadius: 28,
          padding: "28px 24px",
          background:
            "linear-gradient(135deg, rgba(24,50,41,0.94) 0%, rgba(42,88,74,0.9) 52%, rgba(108,134,89,0.88) 100%)",
          color: "#f7f0df",
          boxShadow: "0 22px 52px rgba(24, 50, 41, 0.18)",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 12,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            opacity: 0.78,
          }}
        >
          {eyebrow}
        </p>
        <h1 style={{ margin: "10px 0 12px", fontSize: "clamp(2.3rem, 5vw, 4rem)", lineHeight: 0.98 }}>
          {title}
        </h1>
        <p style={{ maxWidth: 760, margin: 0, fontSize: 18, lineHeight: 1.55, color: "rgba(247, 240, 223, 0.86)" }}>
          {description}
        </p>
      </section>

      <section style={{ marginTop: 24 }}>{children}</section>
    </main>
  );
}
