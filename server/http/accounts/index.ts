import { getGoldTargets } from "@/lib/queries/gold";
import { fleetQuerySchema } from "@/lib/validation/schemas";
import { withAuth } from "@/lib/auth/guard";
import { getEffectiveFleetUserId } from "@/lib/auth/fleet-user";
import { getAccountSummaries, type AccountFilters } from "@/lib/queries/accounts";

export const dynamic = "force-dynamic";

/**
 * GET /api/accounts — account table rows + fleet totals.
 * Query: q, mode, groupId, broker, agentId, status, sort, dir
 */
export const GET = withAuth({ limit: { key: "accounts", limit: 240, windowSec: 60 } }, async (req, ctx) => {
  const filters = fleetQuerySchema.parse(Object.fromEntries([...req.nextUrl.searchParams].filter(([, value]) => value !== "")));
  const fleetUserId = await getEffectiveFleetUserId(ctx.user);
  const [data, goldTargets] = await Promise.all([
    getAccountSummaries(fleetUserId, filters),
    req.nextUrl.searchParams.get("includeGold") === "1" ? getGoldTargets(fleetUserId) : Promise.resolve(undefined),
  ]);
  return Response.json({ ...data, ...(goldTargets ? { goldTargets } : {}) });
});
