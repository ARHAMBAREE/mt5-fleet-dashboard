import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";

/**
 * Publish a durable realtime event.
 *
 * The row in `realtime_events` is the source of truth — SSE/WS consumers
 * poll this table (and optionally receive a Postgres NOTIFY hint). Nothing
 * is kept only in server memory, so any Vercel Fluid Compute instance can
 * serve the next request.
 */
export async function publishEvent(
  userId: string,
  type: string,
  data: Prisma.InputJsonValue
): Promise<{ id: bigint; createdAt: Date }> {
  const ev = await prisma.realtimeEvent.create({
    data: { userId, type, data },
    select: { id: true, createdAt: true },
  });

  // Best-effort cross-instance wake-up hint (payload is only an id, never data).
  // Harmless when no listener exists (e.g. plain Vercel functions).
  try {
    if (process.env.DATABASE_URL?.startsWith("postgres")) {
      await prisma.$executeRaw`SELECT pg_notify('mt5fleet', ${`${userId}:${ev.id.toString()}`})`;
    }
  } catch {
    /* NOTIFY unavailable — consumers still converge via polling */
  }

  return ev;
}

/** Fetch events after a cursor (used by SSE + WS for resync/catch-up). */
export async function eventsAfter(userId: string, afterId: bigint | null, limit = 100) {
  return prisma.realtimeEvent.findMany({
    where: { userId, ...(afterId !== null ? { id: { gt: afterId } } : {}) },
    orderBy: { id: "asc" },
    take: limit,
  });
}

/** Monotonic cursor: latest event id for a user (bootstrap for clients). */
export async function latestEventId(userId: string): Promise<bigint | null> {
  const last = await prisma.realtimeEvent.findFirst({
    where: { userId },
    orderBy: { id: "desc" },
    select: { id: true },
  });
  return last?.id ?? null;
}
