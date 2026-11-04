import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getSessionUser, type AuthUser } from "@/lib/auth/session";
import { verifyCsrf } from "@/lib/auth/csrf";
import { rateLimit, clientIp } from "@/lib/validation/rate-limit";
import type { Role } from "@/shared/types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ ok: false, code, error: message }, { status });
}

/** Normalise thrown errors to a safe JSON response. */
export function handleApiError(err: unknown): NextResponse {
  if (err instanceof ApiError) return jsonError(err.status, err.code, err.message);
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    console.error("[api validation error]", issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid payload", err.issues);
    return jsonError(400, "VALIDATION", issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid payload");
  }
  console.error("[api]", err);
  return jsonError(500, "INTERNAL", "Internal server error");
}

const ROLE_RANK: Record<Role, number> = { VIEWER: 1, ADMIN: 2, OWNER: 3 };

export interface HandlerContext {
  user: AuthUser;
  params: Record<string, string>;
}

type Handler<P = Record<string, string>> = (
  req: NextRequestCompat,
  ctx: { params: Promise<P> }
) => Promise<Response>;

export interface RouteOptions {
  /** Minimum role required (default VIEWER for GET, ADMIN for mutations). */
  minRole?: Role;
  /** Rate-limit bucket + limit, e.g. { key: "accounts", limit: 60, windowSec: 60 } */
  limit?: { key: string; limit: number; windowSec: number };
  /** Skip CSRF (only for endpoints authenticated by bearer token). */
  skipCsrf?: boolean;
}

type NextRequestCompat = Request & { nextUrl: { pathname: string }; cookies: { get(n: string): { value?: string } | undefined } };

/**
 * Wrap a route handler with: auth → CSRF → role check → rate limit.
 * On failure returns a proper HTTP error Response.
 */
export function withAuth<P extends Record<string, string> = Record<string, string>>(
  options: RouteOptions,
  handler: (
    req: NextRequest,
    ctx: { params: Promise<P>; user: AuthUser; ip: string }
  ) => Promise<Response>
): (req: NextRequest, ctx: { params: Promise<P> }) => Promise<Response> {
  return async (req, ctx) => {
    try {
      const user = await getSessionUser(req);
      if (!user) return jsonError(401, "UNAUTHORIZED", "Authentication required");

      const mutating = req.method !== "GET" && req.method !== "HEAD";
      if (mutating && !options.skipCsrf && !verifyCsrf(req)) {
        return jsonError(403, "CSRF", "Invalid or missing CSRF token");
      }

      const minRole: Role = options.minRole ?? (mutating ? "ADMIN" : "VIEWER");
      if (ROLE_RANK[user.role] < ROLE_RANK[minRole]) {
        return jsonError(403, "FORBIDDEN", `Requires ${minRole} role`);
      }

      const ip = clientIp(req);
      if (options.limit) {
        const rl = await rateLimit(`${options.limit.key}:${user.id}`, options.limit.limit, options.limit.windowSec);
        if (!rl.allowed) return jsonError(429, "RATE_LIMITED", "Too many requests — retry shortly");
      }

      return await handler(req, { params: ctx.params, user, ip });
    } catch (err) {
      return handleApiError(err);
    }
  };
}

/** Validate a JSON body against a zod schema (throws ApiError on failure). */
export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    const maxBytes = 2 * 1024 * 1024;
    if (Number(req.headers.get("content-length")) > maxBytes) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Maximum payload is 2 MiB");
    const reader = req.body?.getReader();
    if (!reader) throw new ApiError(400, "VALIDATION", "JSON body required");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Maximum payload is 2 MiB"); }
      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString("utf8").replace(/\0+$/g, "").trim();
    raw = JSON.parse(text);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(400, "VALIDATION", "Body must be valid JSON");
  }
  return schema.parse(raw);
}
