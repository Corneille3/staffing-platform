import type { Metadata } from "next";
import React from "react";
import { Navigation } from "../components/navigation";

export const metadata: Metadata = {
  title: "APF Staffing Platform",
  description: "APF staffing platform operations dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background:
            "radial-gradient(circle at top, #f4efe2 0%, #ebe5d8 24%, #d8d7cb 52%, #bcc9c2 100%)",
          color: "#183229",
          fontFamily: 'Georgia, "Times New Roman", serif',
        }}
      >
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            backdropFilter: "blur(14px)",
            background: "rgba(244, 239, 226, 0.78)",
            borderBottom: "1px solid rgba(24, 50, 41, 0.1)",
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
              <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase" }}>
                APF Staffing Platform
              </p>
              <strong style={{ display: "block", marginTop: 4, fontSize: 20 }}>Operations Console</strong>
            </div>
            <Navigation />
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
