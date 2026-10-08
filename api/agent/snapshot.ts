import { NextResponse } from "next/server";
import { handleApiError, readJson } from "@/lib/auth/guard";
import { rateLimit } from "@/lib/validation/rate-limit";
import { authenticateAgent } from "@/lib/agent/auth";
import { snapshotSchema } from "@/lib/validation/agent-schemas";
import { ingestSnapshot } from "@/server/agent/ingest";
import { evaluateAccountAlerts } from "@/server/agent/alerts";
import { env } from "@/lib/env";
import type { AgentSnapshotResponse } from "@/shared/protocol";

/**
 * POST /api/agent/snapshot — account state every 5s (compact JSON).
 * Persists latest state + time series, evaluates alerts, publishes a
 * throttled invalidation event.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const agent = await authenticateAgent(req);
    const rl = await rateLimit(`agent-snap:${agent.id}`, 60, 60);
    if (!rl.allowed) return NextResponse.json({ ok: false, code: "RATE_LIMITED", error: "slow down" }, { status: 429 });

    const body = await readJson(req, snapshotSchema);
    const { account } = await ingestSnapshot(agent, body.account);

    // Alerts right after money-moving state changes.
    await evaluateAccountAlerts(account.id).catch((err) => console.error("[alerts]", err));

    const res: AgentSnapshotResponse = {
      ok: true,
      serverTime: Date.now(),
      fullSync: agent.fullSync,
    };
    return NextResponse.json(res);
  } catch (err) {
    return handleApiError(err);
  }
}
