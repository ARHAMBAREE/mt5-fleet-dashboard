import { fleetQuerySchema } from "@/lib/validation/schemas";
import { withAuth } from "@/lib/auth/guard";
import { getAnalytics } from "@/lib/queries/analytics";
import type { AccountFilters } from "@/lib/queries/accounts";

export const dynamic = "force-dynamic";

/**
 * GET /api/analytics — combined fleet analytics + ranking.
 * Query: q, mode, groupId, broker, agentId, range (24h|7d|30d|90d|1y)
 */
export const GET = withAuth({ limit: { key: "analytics", limit: 120, windowSec: 60 } }, async (req, ctx) => {
  const filters = fleetQuerySchema.parse(Object.fromEntries([...req.nextUrl.searchParams].filter(([, value]) => value !== "")));
  const data = await getAnalytics(ctx.user.id, filters);
  return Response.json(data);
});
