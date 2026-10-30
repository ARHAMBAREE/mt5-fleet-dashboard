import { z } from "zod";
import { ApiError, handleApiError, readJson, withAuth } from "@/lib/auth/guard";
import { prisma } from "@/lib/database/prisma";
import { getEffectiveFleetUserId } from "@/lib/auth/fleet-user";
import { revokeAgent } from "@/lib/agent/auth";

export const dynamic = "force-dynamic";

const renameSchema = z.object({ name: z.string().min(1).max(80) });

/**
 * PATCH /api/agents/[id] — rename agent
 * DELETE /api/agents/[id] — revoke agent credential immediately
 */
export const PATCH = withAuth<{ id: string }>(
  { minRole: "ADMIN", limit: { key: "agents-write", limit: 60, windowSec: 60 } },
  async (req, ctx) => {
    const { id } = await ctx.params;
    const body = await readJson(req, renameSchema);
    const fleetUserId = await getEffectiveFleetUserId(ctx.user);
    const agent = await prisma.agent.findFirst({ where: { id, userId: fleetUserId } });
    if (!agent) throw new ApiError(404, "NOT_FOUND", "Agent not found");
    const updated = await prisma.agent.update({ where: { id }, data: { name: body.name } });
    return Response.json({ ok: true, agent: { id: updated.id, name: updated.name } });
  }
);

export const DELETE = withAuth<{ id: string }>(
  { minRole: "ADMIN", limit: { key: "agents-write", limit: 60, windowSec: 60 } },
  async (req, ctx) => {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const permanent = url.searchParams.get("permanent") === "true";
    const fleetUserId = await getEffectiveFleetUserId(ctx.user);

    const agent = await prisma.agent.findFirst({ where: { id, userId: fleetUserId } });
    if (!agent) throw new ApiError(404, "NOT_FOUND", "Agent not found");

    if (permanent || agent.status === "REVOKED") {
      // Unlink any accounts first, then delete agent record
      await prisma.account.updateMany({ where: { agentId: id }, data: { agentId: null } });
      await prisma.agent.delete({ where: { id } });
      return Response.json({ ok: true, deleted: true });
    }

    await revokeAgent(fleetUserId, id);
    return Response.json({ ok: true, revoked: true });
  }
);
