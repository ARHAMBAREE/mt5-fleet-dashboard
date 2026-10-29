import { z } from "zod";
import { ApiError, readJson, withAuth } from "@/lib/auth/guard";
import { getEffectiveFleetUserId } from "@/lib/auth/fleet-user";
import { prisma } from "@/lib/database/prisma";

export const dynamic = "force-dynamic";

const ackSchema = z.object({
  id: z.string().uuid().optional(), // specific event
  all: z.boolean().optional(),     // acknowledge everything
});

/**
 * GET /api/alerts/events?after= — event feed for the Alerts screen
 * POST /api/alerts/events — acknowledge {id} or {all:true}
 */
export const GET = withAuth({ limit: { key: "alert-events", limit: 240, windowSec: 60 } }, async (req, ctx) => {
  const after = req.nextUrl.searchParams.get("after");
  const fleetUserId = await getEffectiveFleetUserId(ctx.user);
  const events = await prisma.alertEvent.findMany({
    where: {
      userId: fleetUserId,
      ...(after && /^\d+$/.test(after) ? { triggeredAt: { lt: new Date(Number(after)) } } : {}),
    },
    orderBy: { triggeredAt: "desc" },
    take: 200,
    include: { account: { select: { login: true, broker: true } } },
  });
  return Response.json({ events });
});

export const POST = withAuth({ minRole: "VIEWER", limit: { key: "alert-ack", limit: 120, windowSec: 60 } }, async (req, ctx) => {
  const body = await readJson(req, ackSchema);
  const now = new Date();
  const fleetUserId = await getEffectiveFleetUserId(ctx.user);
  if (body.all) {
    await prisma.alertEvent.updateMany({
      where: { userId: fleetUserId, acknowledgedAt: null },
      data: { acknowledgedAt: now },
    });
    return Response.json({ ok: true });
  }
  if (!body.id) throw new ApiError(400, "VALIDATION", "id or all required");
  const ev = await prisma.alertEvent.findFirst({ where: { id: body.id, userId: fleetUserId } });
  if (!ev) throw new ApiError(404, "NOT_FOUND", "Event not found");
  await prisma.alertEvent.update({ where: { id: ev.id }, data: { acknowledgedAt: now } });
  return Response.json({ ok: true });
});
