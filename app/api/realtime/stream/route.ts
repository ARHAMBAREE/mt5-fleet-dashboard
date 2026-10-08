import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { eventsAfter, latestEventId } from "@/lib/realtime/publish";
import { evaluateOfflineAlerts } from "@/server/agent/alerts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TICK_MS = 2_000;
const MAX_STREAM_MS = 240_000; // Vercel maxDuration=300 → close cleanly before
const OFFLINE_EVAL_MS = 10_000;

/**
 * GET /api/realtime/stream — Server-Sent Events transport.
 *
 * Design for serverless: no sockets are held longer than maxDuration, all
 * state comes from PostgreSQL (realtime_events), consumers reconnect with
 * Last-Event-ID and receive missed events (duplicate-safe via id), then
 * re-fetch REST state. Works on every Vercel Fluid Compute instance.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const user = await getSessionUser(req);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const requested = Number(url.searchParams.get("after") ?? "");
  const lastEventId = req.headers.get("last-event-id");
  let cursor: bigint | null =
    lastEventId && /^\d+$/.test(lastEventId)
      ? BigInt(lastEventId)
      : Number.isFinite(requested) && requested > 0
        ? BigInt(requested)
        : await latestEventId(user.id);

  const encoder = new TextEncoder();
  let cancelled = false;
  const abort = () => {
    cancelled = true;
  };
  req.signal.addEventListener("abort", abort);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown, id?: string) => {
        if (cancelled) return;
        try {
          const payload = `id: ${id ?? ""}\ndata: ${JSON.stringify(obj)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          cancelled = true;
        }
      };
      const ping = () => {
        if (cancelled) return;
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          cancelled = true;
        }
      };

      const openedAt = Date.now();
      let lastEval = 0;
      send({ type: "hello", ts: Date.now(), cursor: cursor?.toString() ?? null }, cursor?.toString());

      while (!cancelled && Date.now() - openedAt < MAX_STREAM_MS) {
        try {
          const batch = await eventsAfter(user.id, cursor, 100);
          for (const ev of batch) {
            cursor = ev.id;
            send({ type: ev.type, data: ev.data, ts: ev.createdAt.getTime() }, ev.id.toString());
          }
          if (!batch.length) ping(); // keep-alive every tick
        } catch (err) {
          console.error("[sse]", err);
          send({ type: "error", ts: Date.now() });
        }

        if (Date.now() - lastEval > OFFLINE_EVAL_MS) {
          lastEval = Date.now();
          if (!await getSessionUser(req)) { cancelled = true; break; }
          await evaluateOfflineAlerts(user.id).catch(() => {});
        }

        await new Promise((r) => setTimeout(r, TICK_MS));
      }

      send({ type: "bye", ts: Date.now(), cursor: cursor?.toString() ?? null }, cursor?.toString());
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
