import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { ApiError, readJson, withAuth } from "@/lib/auth/guard";
import { getEffectiveFleetUserId } from "@/lib/auth/fleet-user";
import { getAccountDetail, type SeriesRange } from "@/lib/queries/detail";

import { publishEvent } from "@/lib/realtime/publish";

export const dynamic = "force-dynamic";

const RANGES = new Set(["24h", "7d", "30d", "90d", "1y"]);

/** GET /api/accounts/[id]?range=30d — full account detail payload. */
export const GET = withAuth<{ id: string }>(
  { limit: { key: "account-detail", limit: 120, windowSec: 60 } },
  async (req, ctx) => {
    const { id } = await ctx.params;
    const range = (req.nextUrl.searchParams.get("range") ?? "30d") as SeriesRange;
    if (!RANGES.has(range)) throw new ApiError(400, "VALIDATION", "Invalid range");

    const fleetUserId = await getEffectiveFleetUserId(ctx.user);
    const detail = await getAccountDetail(fleetUserId, id, range);
    if (!detail) throw new ApiError(404, "NOT_FOUND", "Account not found");
    return Response.json(detail);
  }
);

const editSchema = z.object({
  displayName: z.string().trim().max(80).optional(),
  favorite: z.boolean().optional(),
}).strict().refine(v => v.displayName !== undefined || v.favorite !== undefined, "No changes provided");

export const PATCH = withAuth<{ id: string }>({ minRole: "ADMIN", limit: {key: "account-edit", limit: 60, windowSec: 60} }, async (req, ctx) => {
  const {id} = await ctx.params;
  const body = await readJson(req, editSchema);
  const fleetUserId = await getEffectiveFleetUserId(ctx.user);
  const result = await prisma.account.updateMany({where:{id,userId:fleetUserId},data:{
    ...(body.displayName !== undefined ? {displayName:body.displayName || null} : {}),
    ...(body.favorite !== undefined ? {favorite:body.favorite} : {}),
  }});
  if (!result.count) throw new ApiError(404,"NOT_FOUND","Account not found");
  return Response.json({ok:true});
});

export const DELETE = withAuth<{ id: string }>(
  { minRole: "ADMIN", limit: { key: "account-delete", limit: 60, windowSec: 60 } },
  async (_req, ctx) => {
    const { id } = await ctx.params;
    const fleetUserId = await getEffectiveFleetUserId(ctx.user);
    const account = await prisma.account.findFirst({ where: { id, userId: fleetUserId } });
    if (!account) throw new ApiError(404, "NOT_FOUND", "Account not found");

    await prisma.account.delete({ where: { id } });
    await publishEvent(fleetUserId, "accounts:update", { accountIds: [id], deleted: true });
    return Response.json({ ok: true });
  }
);

