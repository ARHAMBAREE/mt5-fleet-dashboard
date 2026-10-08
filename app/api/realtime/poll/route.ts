import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { eventsAfter, latestEventId } from "@/lib/realtime/publish";

export const dynamic = "force-dynamic";

/**
 * GET /api/realtime/poll?after=<cursor> — REST fallback used when both the
 * WebSocket and SSE transports are unavailable. Same durable event log.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });

  const after = req.nextUrl.searchParams.get("after");
  let cursor: bigint | null = after && /^\d+$/.test(after) ? BigInt(after) : await latestEventId(user.id);

  const events = await eventsAfter(user.id, cursor, 200);
  if (events.length) cursor = events[events.length - 1].id;

  return NextResponse.json({
    ok: true,
    cursor: cursor?.toString() ?? null,
    events: events.map((e) => ({ id: e.id.toString(), type: e.type, data: e.data, ts: e.createdAt.getTime() })),
    serverTime: Date.now(),
  });
}
