import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const intlMiddleware = createMiddleware(routing);

const isPublicRoute = createRouteMatcher([
  "/:locale/sign-in(.*)",
  "/:locale/sign-up(.*)",
  "/:locale/not-invited",
  // Unprefixed variants: post-sign-out redirects and the SignIn/SignUp
  // cross-links target these before the intl middleware adds the locale
  // prefix — they must pass auth.protect() too, or the bounce to the
  // Clerk sign-in URL silently swallows the navigation.
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/not-invited",
]);

export default CLERK_ENABLED
  ? clerkMiddleware(async (auth, request) => {
      if (!isPublicRoute(request)) {
        await auth.protect();
      }
      return intlMiddleware(request);
    })
  : (request: NextRequest) => intlMiddleware(request);

export const config = {
  matcher: [
    "/((?!_next|_vercel|api|trpc|.*\\..*).*)",
  ],
};
