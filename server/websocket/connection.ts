import type { WebSocket } from "ws";
import { prisma } from "@/lib/database/prisma";
import { eventsAfter, latestEventId } from "@/lib/realtime/publish";
import { evaluateOfflineAlerts } from "@/server/agent/alerts";

/** Connection-local cursors only. All sessions and events are durable in PostgreSQL. */
export function serveConnection(ws: WebSocket, userId: string, sessionId: string): Promise<void> {
  return new Promise((resolve) => {
    let cursor: bigint | null = null;
    let ready = false;
    let busy = false;
    let lastPing = Date.now();
    let lastAuth = 0;
    let lastEvaluation = 0;
    const opened = Date.now();
    const send = (data: unknown) => { if (ws.readyState === 1) ws.send(JSON.stringify(data)); };
    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "ping") { lastPing = Date.now(); send({ type: "pong", ts: lastPing }); }
        if (msg.type === "hello" && !ready) {
          cursor = typeof msg.cursor === "string" && /^\d{1,19}$/.test(msg.cursor)
            ? BigInt(msg.cursor) : await latestEventId(userId);
          ready = true;
          send({ type: "hello", cursor: cursor?.toString(), ts: Date.now() });
        }
      } catch { ws.close(1008, "Invalid message"); }
    });
    const timer = setInterval(async () => {
      if (busy || ws.readyState !== 1) return;
      busy = true;
      try {
        const now = Date.now();
        if (now - opened > 240_000 || now - lastPing > 60_000 || (!ready && now - opened > 10_000)) {
          ws.close(1000, "Reconnect"); return;
        }
        if (now - lastAuth > 15_000) {
          lastAuth = now;
          const session = await prisma.session.findFirst({ where: { id: sessionId, userId, expiresAt: { gt: new Date() } } });
          if (!session) { ws.close(1008, "Session expired"); return; }
        }
        if (!ready) return;
        if (ws.bufferedAmount > 1_000_000) { ws.close(1013, "Slow consumer"); return; }
        for (const e of await eventsAfter(userId, cursor, 200)) {
          send({ id: e.id.toString(), type: e.type, data: e.data, ts: e.createdAt.getTime() });
          cursor = e.id;
        }
        if (now - lastEvaluation > 10_000) {
          lastEvaluation = now;
          await evaluateOfflineAlerts(userId);
        }
      } catch { ws.close(1011, "Reconnect"); }
      finally { busy = false; }
    }, 2000);
    const finish = () => { clearInterval(timer); resolve(); };
    ws.once("close", finish);
    ws.once("error", finish);
  });
}
