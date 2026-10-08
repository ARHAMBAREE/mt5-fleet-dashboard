import { ApiError, withAuth } from "@/lib/auth/guard";
import { getAccountDetail, type SeriesRange } from "@/lib/queries/detail";

export const dynamic = "force-dynamic";

const RANGES = new Set(["24h", "7d", "30d", "90d", "1y"]);

/** GET /api/accounts/[id]?range=30d — full account detail payload. */
export const GET = withAuth<{ id: string }>(
  { limit: { key: "account-detail", limit: 120, windowSec: 60 } },
  async (req, ctx) => {
    const { id } = await ctx.params;
    const range = (req.nextUrl.searchParams.get("range") ?? "30d") as SeriesRange;
    if (!RANGES.has(range)) throw new ApiError(400, "VALIDATION", "Invalid range");

    const detail = await getAccountDetail(ctx.user.id, id, range);
    if (!detail) throw new ApiError(404, "NOT_FOUND", "Account not found");
    return Response.json(detail);
  }
);
