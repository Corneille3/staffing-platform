import type { Metadata } from "next";
import React from "react";
import { Inter_Tight, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { RoleProvider } from "../lib/role-context";
import { RoleSwitcher } from "../components/role-switcher";
import "./globals.css";

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter-tight",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

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
    <html
      lang="fr"
      className={`${interTight.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        {CLERK_ENABLED ? (
          <ClerkProvider>{inner}</ClerkProvider>
        ) : (
          inner
        )}
      </body>
    </html>
  );
}
