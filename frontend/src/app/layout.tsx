import type { Metadata } from "next";
import React from "react";
import { RoleProvider } from "../lib/role-context";
import { RoleSwitcher } from "../components/role-switcher";

export const metadata: Metadata = {
  title: "APF Staffing Platform",
  description: "APF bilingual substitute dispatch",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          color: "#183229",
          fontFamily: 'Georgia, "Times New Roman", serif',
        }}
      >
        <RoleProvider>
          {children}
          <RoleSwitcher />
        </RoleProvider>
      </body>
    </html>
  );
}
