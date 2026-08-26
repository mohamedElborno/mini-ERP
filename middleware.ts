import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const intlMiddleware = createMiddleware(routing);

// 1. Define public routes (accessible to visitors)
const isPublicRoute = createRouteMatcher([
  "/:locale/sign-in(.*)",
  "/sign-in(.*)",
  "/:locale/view(.*)",
  "/view(.*)",
]);

const VIEW_RATE_LIMIT = new Map<string, { count: number; resetAt: number }>();
const VIEW_MAX_REQUESTS_PER_MINUTE = 40;

function isPublicViewPath(pathname: string): boolean {
  return (
    /^\/(?:ar|en)\/view(?:\/|$)/.test(pathname) ||
    pathname === "/view" ||
    pathname.startsWith("/view/")
  );
}

function applyPublicViewSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function checkViewRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = VIEW_RATE_LIMIT.get(ip);
  if (!entry || now > entry.resetAt) {
    VIEW_RATE_LIMIT.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= VIEW_MAX_REQUESTS_PER_MINUTE) return false;
  entry.count += 1;
  return true;
}

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export default clerkMiddleware(async (auth, request) => {
  const { pathname } = request.nextUrl;

  // HTTPS only in production (public document URLs carry secrets in the path)
  if (
    process.env.NODE_ENV === "production" &&
    request.headers.get("x-forwarded-proto") === "http"
  ) {
    const httpsUrl = request.nextUrl.clone();
    httpsUrl.protocol = "https:";
    return NextResponse.redirect(httpsUrl);
  }

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

  // Rate limit anonymous public document views
  if (isPublicViewPath(pathname)) {
    const ip = clientIp(request);
    if (!checkViewRateLimit(ip)) {
      return applyPublicViewSecurityHeaders(
        new NextResponse("Too Many Requests", { status: 429 }),
      );
    }
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
  const response = intlMiddleware(request);
  if (isPublicViewPath(pathname)) {
    return applyPublicViewSecurityHeaders(response);
  }
  return response;
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mp4|webm|mov)).*)",
    "/(api|trpc)(.*)",
  ],
};
