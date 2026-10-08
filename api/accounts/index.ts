import { fleetQuerySchema } from "@/lib/validation/schemas";
import { withAuth } from "@/lib/auth/guard";
import { getAccountSummaries, type AccountFilters } from "@/lib/queries/accounts";

export const dynamic = "force-dynamic";

/**
 * GET /api/accounts — account table rows + fleet totals.
 * Query: q, mode, groupId, broker, agentId, status, sort, dir
 */
export const GET = withAuth({ limit: { key: "accounts", limit: 240, windowSec: 60 } }, async (req, ctx) => {
  const filters = fleetQuerySchema.parse(Object.fromEntries([...req.nextUrl.searchParams].filter(([, value]) => value !== "")));
  const data = await getAccountSummaries(ctx.user.id, filters);
  return Response.json(data);
});
