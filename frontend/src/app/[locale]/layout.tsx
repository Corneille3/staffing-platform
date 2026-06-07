import type { Metadata } from "next";
import React from "react";
import { Inter_Tight, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { frFR } from "@clerk/localizations";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { RoleProvider } from "../../lib/role-context";
import { RoleSwitcher } from "../../components/role-switcher";
import { routing } from "../../i18n/routing";
import "../globals.css";

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

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const inner = (
    <RoleProvider>
      {children}
      <RoleSwitcher />
    </RoleProvider>
  );

  return (
    <html
      lang={locale}
      className={`${interTight.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <NextIntlClientProvider>
          {CLERK_ENABLED ? (
            // French Clerk widget under /fr — English is Clerk's default.
            <ClerkProvider localization={locale === "fr" ? frFR : undefined}>
              {inner}
            </ClerkProvider>
          ) : (
            inner
          )}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
