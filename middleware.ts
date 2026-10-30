import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose/jwt/verify";

/**
 * Edge middleware: redirect unauthenticated browsers away from app pages.
 * Verification here is signature-only (fast); route handlers re-verify the
 * session against PostgreSQL, so revocation always wins.
 */

const PUBLIC_PATHS = ["/login", "/register", "/api", "/_next", "/favicon.ico", "/icons", "/manifest.webmanifest", "/downloads"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // MQL5 WebRequest public licensing endpoint — bypass CORS/session checks
  if (pathname === "/api/verify") {
    if (req.method === "OPTIONS") return new NextResponse(null, { status: 204 });
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    const origin = req.headers.get("origin");
    const allowed = [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL, ...(process.env.ALLOWED_ORIGINS ?? "").split(",")].filter(Boolean).map(x => x!.trim().replace(/\/+$/, ""));
    if (process.env.NODE_ENV !== "production") allowed.push("http://localhost:3000", "http://127.0.0.1:3000");
    if (origin && !allowed.includes(origin)) return NextResponse.json({ ok: false, error: "Origin not allowed" }, { status: 403 });
    const response = req.method === "OPTIONS" ? new NextResponse(null, { status: 204 }) : NextResponse.next();
    if (origin) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Access-Control-Allow-Credentials", "true");
      response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      response.headers.set("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token, Authorization");
      response.headers.set("Vary", "Origin");
    }
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  if (isPublic(pathname)) return NextResponse.next();

  const token = req.cookies.get("mt5fleet_session")?.value;
  let authed = false;
  if (token) {
    try {
      const secret = process.env.AUTH_SECRET;
      if (secret) {
        await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
        authed = true;
      }
    } catch {
      authed = false;
    }
  }

  if (!authed) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ ok: false, code: "UNAUTHORIZED", error: "Authentication required" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons).*)"],
};
