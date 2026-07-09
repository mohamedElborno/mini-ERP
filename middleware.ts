import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { NextResponse } from "next/server";

const intlMiddleware = createMiddleware(routing);

// 1. Define public routes (accessible to visitors)
const isPublicRoute = createRouteMatcher([
  "/:locale/sign-in(.*)",
  "/sign-in(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  const { pathname } = request.nextUrl;

  // 2. Exclude static files to reduce server load
  if (
    pathname === "/sitemap.xml" ||
    pathname === "/sitemap" ||
    pathname === "/robots.txt" ||
    pathname === "/manifest.json" ||
    pathname.endsWith(".mp4") ||
    pathname.endsWith(".webm") ||
    pathname.endsWith(".mov") ||
    pathname.startsWith("/videos/")
  ) {
    return NextResponse.next();
  }

  // 3. Exclude system files and internal APIs
  if (pathname.startsWith("/api") || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  // 4. Security layer (The Iron Gate)
  if (!isPublicRoute(request)) {
    const authObject = await auth();

    // If the user is not authenticated, hijack the redirect process
    if (!authObject.userId) {
      // Extract the requested locale from the URL (e.g., /ar/dashboard -> ar)
      const segments = pathname.split("/");
      const requestedLocale = segments[1];

      // Verify if it's a supported locale, otherwise use the default one
      const locale = routing.locales.includes(requestedLocale as any)
        ? requestedLocale
        : routing.defaultLocale;

      // Construct the localized sign-in URL manually
      const signInUrl = new URL(`/${locale}/sign-in`, request.url);

      // Preserve the intended destination after successful login
      signInUrl.searchParams.set("redirect_url", request.url);

      return NextResponse.redirect(signInUrl);
    }
  }

  // 5. Pass the authenticated request to the i18n middleware
  return intlMiddleware(request);
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mp4|webm|mov)).*)",
    "/(api|trpc)(.*)",
  ],
};
