import { NextResponse } from "next/server";
import { handleApiError, readJson } from "@/lib/auth/guard";
import { rateLimit, clientIp } from "@/lib/validation/rate-limit";
import { redeemPairingCode } from "@/lib/agent/auth";
import { registerSchema } from "@/lib/validation/agent-schemas";
import { env } from "@/lib/env";
import type { AgentRegisterResponse } from "@/shared/protocol";

/**
 * POST /api/agent/register
 * Pairing-code exchange → issues a unique agent credential.
 * Unauthenticated by design; rate-limited per IP.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const rl = await rateLimit(`agent-register:${clientIp(req)}`, 200, 60);
    if (!rl.allowed) return NextResponse.json({ ok: false, code: "RATE_LIMITED", error: "Too many attempts" }, { status: 429 });

    const body = await readJson(req, registerSchema);
    const result = await redeemPairingCode({
      pairingCode: body.pairingCode,
      installationId: body.installationId,
      platform: body.platform,
      terminalBuild: body.terminalBuild,
      terminalCompany: body.terminalCompany,
      terminalName: body.terminalName,
      eaVersion: body.eaVersion,
      name: `${body.terminalCompany || "MT5"} ${body.terminalName || "Terminal"}`.trim().slice(0, 80),
    });

    const res: AgentRegisterResponse = {
      ok: true,
      agentId: result.agentId,
      credential: result.credential,
      heartbeatSeconds: env.HEARTBEAT_SECONDS,
      snapshotSeconds: env.SNAPSHOT_SECONDS,
    };
    return NextResponse.json(res, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
