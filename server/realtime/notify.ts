import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { publishEvent } from "@/lib/realtime/publish";

const MIN_INTERVAL_MS = 2_000; // per (userId, type)

/**
 * Throttled publish: at most one event of this type per user per 2 s.
 * Events are invalidation hints — consumers always re-read PostgreSQL, so
 * dropping a redundant hint never loses data.
 */
export async function publishThrottled(
  userId: string,
  type: string,
  data: Prisma.InputJsonValue
): Promise<void> {
  try {
    const last = await prisma.realtimeEvent.findFirst({
      where: { userId, type },
      orderBy: { id: "desc" },
      select: { createdAt: true },
    });
    if (last && Date.now() - last.createdAt.getTime() < MIN_INTERVAL_MS) return;
    await publishEvent(userId, type, data);
  } catch (err) {
    console.error("[realtime:publish]", err);
  }
}
