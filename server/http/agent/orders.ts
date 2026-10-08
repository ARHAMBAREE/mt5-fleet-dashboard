import { NextResponse } from "next/server";
import { ApiError, handleApiError, readJson } from "@/lib/auth/guard";
import { rateLimit } from "@/lib/validation/rate-limit";
import { authenticateAgent } from "@/lib/agent/auth";
import { ordersSchema } from "@/lib/validation/agent-schemas";
import { boundAccount, syncOrders } from "@/server/agent/ingest";
import type { AgentOkResponse } from "@/shared/protocol";

/** POST /api/agent/orders — pending order changes or full sync. */
export async function POST(req: Request): Promise<Response> {
  try {
    const agent = await authenticateAgent(req);
    const rl = await rateLimit(`agent-ord:${agent.id}`, 120, 60);
    if (!rl.allowed) return NextResponse.json({ ok: false, code: "RATE_LIMITED", error: "slow down" }, { status: 429 });

    const body = await readJson(req, ordersSchema);
    const account = await boundAccount(agent, body.accountLogin, body.server);
    if (!account) throw new ApiError(404, "NOT_FOUND", "Account not found");

    await syncOrders(account, { full: body.full, orders: body.orders, removed: body.removed });
    return NextResponse.json({ ok: true, serverTime: Date.now() } satisfies AgentOkResponse);
  } catch (err) {
    return handleApiError(err);
  }
}
