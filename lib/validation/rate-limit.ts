import "server-only";
import { prisma } from "@/lib/database/prisma";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * Fixed-window rate limiter backed by PostgreSQL — safe across serverless
 * instances (no in-memory counters as the source of truth).
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / (windowSec * 1000)) * windowSec * 1000);

  try {
    const record = await prisma.rateLimit.upsert({
      where: {
        key_windowStart: { key, windowStart },
      },
      update: {
        count: { increment: 1 },
        updatedAt: now,
      },
      create: {
        key,
        windowStart,
        count: 1,
        updatedAt: now,
      },
    });
    const count = record.count;
    const retryAfterSec = Math.max(1, Math.ceil((windowStart.getTime() + windowSec * 1000 - now.getTime()) / 1000));
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfterSec };
  } catch (err) {
    // Fail closed: database failure must not disable brute-force protection.
    console.error("[rate-limit]", err);
    return { allowed: false, remaining: 0, retryAfterSec: 0 };
  }
}

/** Best-effort IP extraction behind Vercel's proxy. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
