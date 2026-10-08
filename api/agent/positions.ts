import { NextResponse } from "next/server";
import { ApiError, handleApiError, readJson } from "@/lib/auth/guard";
import { rateLimit } from "@/lib/validation/rate-limit";
import { authenticateAgent } from "@/lib/agent/auth";
import { positionsSchema } from "@/lib/validation/agent-schemas";
import { boundAccount, syncPositions } from "@/server/agent/ingest";
import { evaluateAccountAlerts } from "@/server/agent/alerts";
import type { AgentOkResponse } from "@/shared/protocol";

/** POST /api/agent/positions — changed positions (+ removals) or full sync. */
export async function POST(req: Request): Promise<Response> {
  try {
    const agent = await authenticateAgent(req);
    const rl = await rateLimit(`agent-pos:${agent.id}`, 120, 60);
    if (!rl.allowed) return NextResponse.json({ ok: false, code: "RATE_LIMITED", error: "slow down" }, { status: 429 });

    const body = await readJson(req, positionsSchema);
    const account = await boundAccount(agent, body.accountLogin, body.server);
    if (!account) throw new ApiError(404, "NOT_FOUND", "Account not found");

    await syncPositions(account, { full: body.full, positions: body.positions, removed: body.removed });
    if (body.positions.length || body.removed?.length) {
      await evaluateAccountAlerts(account.id).catch((err) => console.error("[alerts]", err));
    }

    const res: AgentOkResponse = { ok: true, serverTime: Date.now() };
    return NextResponse.json(res);
  } catch (err) {
    return handleApiError(err);
  }
}
