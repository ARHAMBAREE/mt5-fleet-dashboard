import { z } from "zod";
import { NextResponse } from "next/server";
import { handleApiError, readJson, withAuth } from "@/lib/auth/guard";
import { prisma } from "@/lib/database/prisma";
import { getEffectiveFleetUserId } from "@/lib/auth/fleet-user";
import { createPairingCode } from "@/lib/agent/auth";
import { deriveEaStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

const createSchema = z.object({ label: z.string().max(80).optional() });

/**
 * GET  /api/agents — agents + pairing codes (active codes are shown masked)
 * POST /api/agents — generate a pairing code {label?}
 */
export const GET = withAuth({ limit: { key: "agents", limit: 240, windowSec: 60 } }, async (_req, ctx) => {
  const fleetUserId = await getEffectiveFleetUserId(ctx.user);
  const [agents, codes, heartbeats] = await Promise.all([
    prisma.agent.findMany({
      where: { userId: fleetUserId },
      orderBy: { pairedAt: "desc" },
      include: { _count: { select: { accounts: true } } },
    }),
    prisma.pairingCode.findMany({
      where: { userId: fleetUserId, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.heartbeat.findMany({ where: { agent: { userId: fleetUserId } } }),
  ]);

  const hbByAgent = new Map(heartbeats.map((h) => [h.agentId, h]));
  const now = Date.now();

  return Response.json({
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      platform: a.platform,
      terminalCompany: a.terminalCompany,
      terminalName: a.terminalName,
      terminalBuild: a.terminalBuild,
      eaVersion: a.eaVersion,
      pairedAt: a.pairedAt.toISOString(),
      revokedAt: a.revokedAt?.toISOString() ?? null,
      lastSeenAt: a.lastSeenAt?.toISOString() ?? null,
      statusValue: a.status === "REVOKED" ? "OFFLINE" : deriveEaStatus(a.lastSeenAt, now),
      accountsCount: a._count.accounts,
      lastHeartbeat: hbByAgent.get(a.id)
        ? {
            at: hbByAgent.get(a.id)!.at.toISOString(),
            accountLogin: hbByAgent.get(a.id)!.accountLogin,
            broker: hbByAgent.get(a.id)!.broker,
            server: hbByAgent.get(a.id)!.server,
            terminalConnected: hbByAgent.get(a.id)!.terminalConnected,
            eaLoaded: hbByAgent.get(a.id)!.eaLoaded,
          }
        : null,
    })),
    pairingCodes: codes.map((c) => ({
      id: c.id,
      label: c.label,
      prefix: c.codePrefix,
      expiresAt: c.expiresAt.toISOString(),
      createdAt: c.createdAt.toISOString(),
    })),
  });
});

export const POST = withAuth({ minRole: "ADMIN", limit: { key: "pairing", limit: 10, windowSec: 60 } }, async (req, ctx) => {
  const body = await readJson(req, createSchema.optional().default({}));
  const fleetUserId = await getEffectiveFleetUserId(ctx.user);
  const result = await createPairingCode(fleetUserId, body.label);
  return NextResponse.json(
    { ok: true, code: result.code, expiresAt: result.expiresAt.toISOString() },
    { status: 201 }
  );
});
