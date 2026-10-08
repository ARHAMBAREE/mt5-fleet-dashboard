import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/database/prisma";
import { env, allowedOrigins } from "@/lib/env";
import { sha256Hex } from "@/lib/security/crypto";
import { serveConnection } from "./connection";

const server = createServer((_req, res) => { res.writeHead(426); res.end("WebSocket upgrade required"); });
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
server.on("upgrade", async (req, socket, head) => {
  try {
    if (req.url?.split("?")[0] !== "/api/ws" || !allowedOrigins().includes(req.headers.origin ?? "")) throw new Error("Origin");
    const cookie = req.headers.cookie?.split(";").map(s => s.trim()).find(s => s.startsWith("mt5fleet_session="));
    const token = cookie?.slice("mt5fleet_session=".length);
    if (!token) throw new Error("Session");
    const { payload } = await jwtVerify(token, new TextEncoder().encode(env.AUTH_SECRET), { algorithms: ["HS256"] });
    const session = await prisma.session.findFirst({ where: { id: String(payload.sid), userId: payload.sub, tokenHash: sha256Hex(token), expiresAt: { gt: new Date() } } });
    if (!session) throw new Error("Session");
    wss.handleUpgrade(req, socket, head, ws => { void serveConnection(ws, session.userId, session.id); });
  } catch { socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n"); socket.destroy(); }
});
server.listen(Number(process.env.WS_PORT || 3001), "127.0.0.1", () => console.log("WebSocket server listening on localhost:3001"));
