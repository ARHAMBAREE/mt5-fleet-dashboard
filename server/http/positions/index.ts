import { withAuth } from "@/lib/auth/guard";
import { prisma } from "@/lib/database/prisma";
import { paginationSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/**
 * GET /api/positions — open positions (optionally filtered by account/symbol/type).
 * Query: accountId, symbol, type, q, page, pageSize
 */
export const GET = withAuth({ limit: { key: "positions", limit: 240, windowSec: 60 } }, async (req, ctx) => {
  const sp = req.nextUrl.searchParams;
  const { page, pageSize } = paginationSchema.parse({
    page: sp.get("page") ?? 1,
    pageSize: sp.get("pageSize") ?? 100,
  });
  const accountId = sp.get("accountId");
  const symbol = sp.get("symbol");
  const type = sp.get("type");
  const q = sp.get("q");

  const where: import("@prisma/client").Prisma.PositionWhereInput = {
    account: { userId: ctx.user.id },
    ...(accountId ? { accountId } : {}),
    ...(symbol ? { symbol } : {}),
    ...(type === "BUY" || type === "SELL" ? { type } : {}),
    ...(q
      ? { OR: [{ symbol: { contains: q } }, { comment: { contains: q } }] }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.position.count({ where }),
    prisma.position.findMany({
      where,
      orderBy: [{ openTime: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { account: { select: { login: true, broker: true, server: true, currency: true } } },
    }),
  ]);

  const floating = items.reduce((s, p) => s + p.profit + p.swap + p.commission, 0);
  return Response.json({ items, total, page, pageSize, floatingPl: floating });
});
