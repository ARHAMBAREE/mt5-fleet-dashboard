import { experimental_upgradeWebSocket } from "@vercel/functions";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";
import { env, allowedOrigins } from "@/lib/env";
import { serveConnection } from "@/server/websocket/connection";
import { rateLimit } from "@/lib/validation/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!allowedOrigins().includes(req.headers.get("origin") ?? "")) return new Response("Forbidden", { status: 403 });
  const user = await getSessionUser(req);
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!(await rateLimit(`ws:${user.id}`, 60, 60)).allowed) return new Response("Rate limited", { status: 429 });
  const { payload } = await jwtVerify(req.cookies.get(SESSION_COOKIE)!.value, new TextEncoder().encode(env.AUTH_SECRET));
  return experimental_upgradeWebSocket(ws => serveConnection(ws, user.id, String(payload.sid)), { maxPayload: 4096 });
}
