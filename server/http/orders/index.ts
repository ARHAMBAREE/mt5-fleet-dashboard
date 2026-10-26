import { withAuth } from "@/lib/auth/guard";
import { prisma } from "@/lib/database/prisma";
import { paginationSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/**
 * GET /api/orders — pending orders.
 * Query: accountId, symbol, type, q, page, pageSize
 */
export const GET = withAuth({ limit: { key: "orders", limit: 240, windowSec: 60 } }, async (req, ctx) => {
  const sp = req.nextUrl.searchParams;
  const { page, pageSize } = paginationSchema.parse({
    page: sp.get("page") ?? 1,
    pageSize: sp.get("pageSize") ?? 100,
  });
  const accountId = sp.get("accountId");
  const symbol = sp.get("symbol");
  const type = sp.get("type");
  const q = sp.get("q");

  const where = {
    account: { userId: ctx.user.id },
    ...(accountId ? { accountId } : {}),
    ...(symbol ? { symbol } : {}),
    ...(type ? { type } : {}),
    ...(q
      ? { OR: [{ symbol: { contains: q } }, { comment: { contains: q } }] }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: [{ createTime: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { account: { select: { login: true, broker: true, server: true, currency: true } } },
    }),
  ]);

  return Response.json({ items, total, page, pageSize });
});
