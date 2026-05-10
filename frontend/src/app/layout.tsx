import type { Metadata } from "next";
import React from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { RoleProvider } from "../lib/role-context";
import { RoleSwitcher } from "../components/role-switcher";

export const metadata: Metadata = {
  title: "Staffig",
  description: "Staffig — bilingual substitute dispatch",
};

const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const inner = (
    <RoleProvider>
      {children}
      <RoleSwitcher />
    </RoleProvider>
  );

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
        {CLERK_ENABLED ? (
          <ClerkProvider>
            {inner}
          </ClerkProvider>
        ) : (
          inner
        )}
      </body>
    </html>
  );
}
