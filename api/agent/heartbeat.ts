import { NextResponse } from "next/server";
import { handleApiError, readJson } from "@/lib/auth/guard";
import { rateLimit } from "@/lib/validation/rate-limit";
import { authenticateAgent } from "@/lib/agent/auth";
import { heartbeatSchema } from "@/lib/validation/agent-schemas";
import { prisma } from "@/lib/database/prisma";
import { publishThrottled } from "@/server/realtime/notify";
import { env } from "@/lib/env";
import type { AgentHeartbeatResponse } from "@/shared/protocol";

/**
 * POST /api/agent/heartbeat — every 5s per terminal.
 * Updates agent liveness + account link; returns intervals + fullSync flag.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const agent = await authenticateAgent(req);
    const rl = await rateLimit(`agent-hb:${agent.id}`, 60, 60);
    if (!rl.allowed) return NextResponse.json({ ok: false, code: "RATE_LIMITED", error: "slow down" }, { status: 429 });

    const body = await readJson(req, heartbeatSchema);
    const now = new Date();
    const wantFullSync = agent.fullSync; // consume the flag exactly once

    const [agentRow] = await Promise.all([
      prisma.agent.update({
        where: { id: agent.id },
        data: { lastSeenAt: now, ...(wantFullSync ? { fullSync: false } : {}) },
      }),
      prisma.heartbeat.upsert({
        where: { agentId: agent.id },
        create: {
          agentId: agent.id,
          accountLogin: body.accountLogin,
          broker: body.broker,
          server: body.server,
          terminalConnected: body.terminalConnected,
          eaLoaded: body.eaLoaded,
          build: body.build,
          at: now,
        },
        update: {
          accountLogin: body.accountLogin,
          broker: body.broker,
          server: body.server,
          terminalConnected: body.terminalConnected,
          eaLoaded: body.eaLoaded,
          build: body.build,
          at: now,
        },
      }),
    ]);

    // Attach the agent to its account (and keep EA status fresh).
    const account = await prisma.account.findFirst({
      where: { userId: agent.userId, login: body.accountLogin, server: body.server, agentId: agent.id },
      orderBy: { updatedAt: "desc" },
    });
    if (account) {
      await Promise.all([
        prisma.account.update({
          where: { id: account.id },
          data: {
            agentId: agent.id,
            broker: body.broker || account.broker,
            server: body.server || account.server,
            terminalConnected: body.terminalConnected,
            algoTrading: body.algoTrading,
            lastHeartbeatAt: now,
          },
        }),
        prisma.eaStatus.upsert({
          where: { accountId: account.id },
          create: {
            accountId: account.id,
            eaLoaded: body.eaLoaded,
            terminalConnected: body.terminalConnected,
            algoTrading: body.algoTrading,
            build: body.build,
            lastHeartbeatAt: now,
          },
          update: {
            eaLoaded: body.eaLoaded,
            terminalConnected: body.terminalConnected,
            algoTrading: body.algoTrading,
            build: body.build,
            lastHeartbeatAt: now,
          },
        }),
        publishThrottled(agent.userId, "heartbeat", { accountId: account.id, at: now.toISOString() }),
      ]);
    }

    const res: AgentHeartbeatResponse = {
      ok: true,
      serverTime: now.getTime(),
      heartbeatSeconds: env.HEARTBEAT_SECONDS,
      snapshotSeconds: env.SNAPSHOT_SECONDS,
      fullSync: wantFullSync,
    };
    void agentRow;
    return NextResponse.json(res);
  } catch (err) {
    return handleApiError(err);
  }
}
