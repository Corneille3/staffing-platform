import React from "react";
import Link from "next/link";

export default function ApfLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #0f1f1a 0%, #163128 38%, #233f34 100%)",
        color: "#f3ead4",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          backdropFilter: "blur(14px)",
          background: "rgba(15, 31, 26, 0.78)",
          borderBottom: "1px solid rgba(247, 240, 223, 0.12)",
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "18px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 20,
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                opacity: 0.7,
              }}
            >
              APF Oversight
            </p>
            <strong style={{ display: "block", marginTop: 4, fontSize: 20 }}>
              Network Visibility
            </strong>
          </div>
          <nav style={{ display: "flex", gap: 8 }}>
            {[
              { label: "Overview", href: "/apf" },
              { label: "Substitute Pool", href: "/apf/substitutes" },
              { label: "Activity", href: "/apf/activity" },
            ].map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                style={{
                  color: "#f3ead4",
                  textDecoration: "none",
                  padding: "8px 14px",
                  borderRadius: 999,
                  background: "rgba(247, 240, 223, 0.12)",
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
