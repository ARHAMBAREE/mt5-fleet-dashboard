import { ApiError, withAuth } from "@/lib/auth/guard";
import { prisma } from "@/lib/database/prisma";
import { getEffectiveFleetUserId } from "@/lib/auth/fleet-user";
import { exportQuerySchema, toCsv } from "@/lib/validation/schemas";
import { getAccountSummaries } from "@/lib/queries/accounts";

export const dynamic = "force-dynamic";

/**
 * GET /api/export?type=accounts|positions|orders|analytics&format=csv|json
 * Streams a downloadable file for the current user's data.
 */
export const GET = withAuth({ limit: { key: "export", limit: 30, windowSec: 300 } }, async (req, ctx) => {
  const q = exportQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const accountId = q.accountId;
  const fleetUserId = await getEffectiveFleetUserId(ctx.user);
  const owner = { userId: fleetUserId, ...(accountId ? { id: accountId } : {}) };

  let headers: string[];
  let rows: unknown[][];
  let payload: unknown;
  const filename = `mt5fleet-${q.type}-${new Date().toISOString().slice(0, 10)}.${q.format}`;

  switch (q.type) {
    case "accounts": {
      const { rows: accounts, totals } = await getAccountSummaries(fleetUserId, {});
      headers = ["STATUS", "ACCOUNT", "BROKER", "SERVER", "MODE", "CURRENCY", "ACCOUNT_CURRENCY", "BALANCE", "EQUITY", "FLOATING_PL", "DRAWDOWN_PCT", "MAX_DD_PCT", "MARGIN_PCT", "POSITIONS", "LEVERAGE", "LAST_HEARTBEAT"];
      rows = accounts.map((a) => [
        a.eaStatus, a.login, a.broker, a.server, a.mode, a.currency, a.sourceCurrency,
        a.balance, a.equity, a.floatingPl, a.drawdownPct, a.maxDrawdownPct,
        a.marginLevel, a.openPositions, a.leverage, a.lastHeartbeatAt ?? "",
      ]);
      payload = { accounts, totals };
      break;
    }
    case "positions": {
      const items = await prisma.position.findMany({
        where: { account: owner },
        orderBy: { openTime: "desc" },
        include: { account: { select: { login: true, broker: true } } },
        take: 50_000,
      });
      headers = ["ACCOUNT", "BROKER", "TICKET", "SYMBOL", "TYPE", "VOLUME", "OPEN_PRICE", "CURRENT_PRICE", "SL", "TP", "SWAP", "COMMISSION", "PROFIT", "MAGIC", "COMMENT", "OPEN_TIME"];
      rows = items.map((p) => [p.account.login, p.account.broker, p.ticket, p.symbol, p.type, p.volume, p.openPrice, p.currentPrice, p.sl, p.tp, p.swap, p.commission, p.profit, p.magic, p.comment, p.openTime.toISOString()]);
      payload = items;
      break;
    }
    case "orders": {
      const items = await prisma.order.findMany({
        where: { account: owner },
        orderBy: { createTime: "desc" },
        include: { account: { select: { login: true, broker: true } } },
        take: 50_000,
      });
      headers = ["ACCOUNT", "BROKER", "TICKET", "SYMBOL", "TYPE", "VOLUME", "PRICE", "SL", "TP", "MAGIC", "COMMENT", "CREATE_TIME"];
      rows = items.map((o) => [o.account.login, o.account.broker, o.ticket, o.symbol, o.type, o.volume, o.price, o.sl, o.tp, o.magic, o.comment, o.createTime.toISOString()]);
      payload = items;
      break;
    }
    case "analytics": {
      const { rows: accounts } = await getAccountSummaries(fleetUserId, {});
      headers = ["RANK", "ACCOUNT", "BROKER", "CURRENCY", "STATUS", "EQUITY", "BALANCE", "FLOATING_PL", "DRAWDOWN_PCT", "MAX_DD_PCT", "OPEN_POSITIONS"];
      rows = [...accounts]
        .sort((a, b) => b.floatingPl - a.floatingPl)
        .map((a, i) => [i + 1, a.login, a.broker, a.currency, a.eaStatus, a.equity, a.balance, a.floatingPl, a.drawdownPct, a.maxDrawdownPct, a.openPositions]);
      payload = { ranking: rows, generatedAt: new Date().toISOString() };
      break;
    }
    default:
      throw new ApiError(400, "VALIDATION", "Unknown export type");
  }

  if (q.format === "json") {
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }
  return new Response(toCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(".json", ".csv")}"`,
    },
  });
});
