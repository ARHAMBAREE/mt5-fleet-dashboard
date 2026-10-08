import { z } from "zod";
import { ApiError, readJson, withAuth } from "@/lib/auth/guard";
import { prisma } from "@/lib/database/prisma";
import { alertSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/**
 * GET    /api/alerts — alert rules + recent events (last 100)
 * POST   /api/alerts — create rule  {type, threshold, ...}
 * PUT    /api/alerts — update rule  {id, ...}
 * DELETE /api/alerts?id=… — delete rule
 */
export const GET = withAuth({ limit: { key: "alerts", limit: 240, windowSec: 60 } }, async (_req, ctx) => {
  const [alerts, events] = await Promise.all([
    prisma.alert.findMany({
      where: { userId: ctx.user.id, type: { not: "DAILY_LOSS_EXCEEDED" } },
      orderBy: [{ enabled: "desc" }, { type: "asc" }],
      include: { account: { select: { id: true, login: true, broker: true } } },
    }),
    prisma.alertEvent.findMany({
      where: { userId: ctx.user.id },
      orderBy: { triggeredAt: "desc" },
      take: 100,
      include: { account: { select: { login: true, broker: true } } },
    }),
  ]);
  const unack = events.filter((e) => !e.acknowledgedAt).length;
  return Response.json({ alerts, events, unacknowledged: unack });
});

export const POST = withAuth({ minRole: "ADMIN", limit: { key: "alerts-write", limit: 60, windowSec: 60 } }, async (req, ctx) => {
  const body = await readJson(req, alertSchema);
  if (body.accountId) {
    const owns = await prisma.account.findFirst({ where: { id: body.accountId, userId: ctx.user.id } });
    if (!owns) throw new ApiError(404, "NOT_FOUND", "Account not found");
  }
  const alert = await prisma.alert.create({
    data: {
      userId: ctx.user.id,
      name: body.name || body.type.replace(/_/g, " ").toLowerCase(),
      type: body.type,
      enabled: body.enabled,
      threshold: body.threshold,
      accountId: body.accountId ?? null,
      cooldownSeconds: body.cooldownSeconds,
      severity: body.severity,
    },
  });
  return Response.json({ ok: true, alert }, { status: 201 });
});

export const PUT = withAuth({ minRole: "ADMIN", limit: { key: "alerts-write", limit: 120, windowSec: 60 } }, async (req, ctx) => {
  const body = await readJson(req, alertSchema.extend({ id: z.string().uuid() }));
  const existing = await prisma.alert.findFirst({ where: { id: body.id, userId: ctx.user.id, type: { not: "DAILY_LOSS_EXCEEDED" } } });
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Alert not found");
  const alert = await prisma.alert.update({
    where: { id: existing.id },
    data: {
      name: body.name || existing.name,
      enabled: body.enabled,
      threshold: body.threshold,
      accountId: body.accountId ?? null,
      cooldownSeconds: body.cooldownSeconds,
      severity: body.severity,
    },
  });
  return Response.json({ ok: true, alert });
});

export const DELETE = withAuth({ minRole: "ADMIN", limit: { key: "alerts-write", limit: 60, windowSec: 60 } }, async (req, ctx) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) throw new ApiError(400, "VALIDATION", "id query parameter required");
  const existing = await prisma.alert.findFirst({ where: { id, userId: ctx.user.id } });
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Alert not found");
  await prisma.alert.delete({ where: { id: existing.id } });
  return Response.json({ ok: true });
});
