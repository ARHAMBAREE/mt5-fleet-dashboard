import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/security/crypto";
import { CSRF_COOKIE } from "@/lib/auth/session";

/** Issue a bound CSRF token (tied to the session token via HMAC). */
export function issueCsrfToken(sessionToken: string): string {
  const nonce = randomBytes(16).toString("base64url");
  const mac = createHmac("sha256", env.AUTH_SECRET).update(sessionToken).digest("base64url");
  return `${nonce}.${mac}`;
}

/**
 * Double-submit CSRF verification for cookie-authenticated mutations.
 * Requires: X-CSRF-Token header === CSRF cookie AND valid HMAC over the
 * session token. Bearer-authenticated agent endpoints are exempt (no cookies).
 */
export function verifyCsrf(req: NextRequest): boolean {
  const cookie = req.cookies.get(CSRF_COOKIE)?.value;
  const header = req.headers.get("x-csrf-token");
  const session = req.cookies.get("mt5fleet_session")?.value;
  if (!cookie || !header || !session) return false;
  if (!safeEqual(cookie, header)) return false;
  const [nonce, mac] = cookie.split(".");
  if (!nonce || !mac) return false;
  const expected = createHmac("sha256", env.AUTH_SECRET).update(session).digest("base64url");
  return safeEqual(mac, expected);
}
