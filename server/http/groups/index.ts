import { ApiError, handleApiError, readJson, withAuth } from "@/lib/auth/guard";
import { prisma } from "@/lib/database/prisma";
import { groupSchema } from "@/lib/validation/schemas";
import { z } from "zod";

export const dynamic = "force-dynamic";

const membershipSchema = z.object({
  accountId: z.string().uuid(),
  groupIds: z.array(z.string().uuid()).max(100),
});

/**
 * GET    /api/groups              — groups with member counts
 * POST   /api/groups              — create a group {name, color}
 * PUT    /api/groups              — set account membership {accountId, groupIds}
 * DELETE /api/groups?id=…         — delete a group (system groups rejected)
 */
export const GET = withAuth({ limit: { key: "groups", limit: 240, windowSec: 60 } }, async (_req, ctx) => {
  const groups = await prisma.group.findMany({
    where: { userId: ctx.user.id },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    include: { _count: { select: { members: true } } },
  });
  const virtual = [{ id: "ALL", name: "ALL", color: "#94a3b8", isSystem: true, count: await prisma.account.count({ where: { userId: ctx.user.id } }) }];
  return Response.json({
    groups: groups.map((g) => ({ id: g.id, name: g.name, color: g.color, isSystem: g.isSystem, count: g._count.members })),
    virtual,
  });
});

export const POST = withAuth({ minRole: "ADMIN", limit: { key: "groups-write", limit: 60, windowSec: 60 } }, async (req, ctx) => {
  const body = await readJson(req, groupSchema);
  const dup = await prisma.group.findFirst({ where: { userId: ctx.user.id, name: body.name.toUpperCase() } });
  if (dup) throw new ApiError(409, "CONFLICT", "Group already exists");
  const group = await prisma.group.create({
    data: { userId: ctx.user.id, name: body.name.toUpperCase(), color: body.color },
  });
  return Response.json({ ok: true, group }, { status: 201 });
});

export const PUT = withAuth({ minRole: "ADMIN", limit: { key: "groups-write", limit: 120, windowSec: 60 } }, async (req, ctx) => {
  const body = await readJson(req, membershipSchema);
  const account = await prisma.account.findFirst({ where: { id: body.accountId, userId: ctx.user.id } });
  if (!account) throw new ApiError(404, "NOT_FOUND", "Account not found");

  const owned = await prisma.group.findMany({ where: { userId: ctx.user.id, id: { in: body.groupIds } }, select: { id: true } });
  const validIds = new Set(owned.map((g) => g.id));

  await prisma.$transaction([
    prisma.accountGroup.deleteMany({ where: { accountId: account.id } }),
    ...(body.groupIds.filter((id) => validIds.has(id)).map((groupId) =>
      prisma.accountGroup.create({ data: { accountId: account.id, groupId } })
    ) ?? []),
  ]);
  return Response.json({ ok: true });
});

export const DELETE = withAuth({ minRole: "ADMIN", limit: { key: "groups-write", limit: 60, windowSec: 60 } }, async (req, ctx) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) throw new ApiError(400, "VALIDATION", "id query parameter required");
  const group = await prisma.group.findFirst({ where: { id, userId: ctx.user.id } });
  if (!group) throw new ApiError(404, "NOT_FOUND", "Group not found");
  if (group.isSystem) throw new ApiError(400, "VALIDATION", "System groups cannot be deleted");
  await prisma.group.delete({ where: { id: group.id } });
  return Response.json({ ok: true });
});
