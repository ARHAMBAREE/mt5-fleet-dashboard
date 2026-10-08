import "server-only";
import { accountMoneyUnit } from "@/lib/currency";
import { prisma } from "@/lib/database/prisma";
import { getAccountSummaries, type AccountFilters } from "@/lib/queries/accounts";
import { drawdown } from "@/lib/calculations/risk";

export interface AnalyticsResult {
  currencies: string[];
  totals: {
    totalAccounts: number;
    online: number;
    warning: number;
    offline: number;
    combinedEquity: number | null;
    combinedBalance: number | null;
    combinedFloatingPl: number | null;
    combinedDrawdownPct: number;
    maxDrawdownPct: number;
    openPositions: number;
  };
  series: { t: string; equity: number; balance: number }[];
  ranking: {
    accountId: string;
    login: string;
    broker: string;
    server: string;
    mode: string;
    currency: string;
    status: string;
    equity: number;
    balance: number;
    floatingPl: number;
    drawdownPct: number;
    maxDrawdownPct: number;
    openPositions: number;
  }[];
  best: { login: string; floatingPl: number } | null;
  worst: { login: string; floatingPl: number } | null;
  highestDrawdown: { login: string; drawdownPct: number } | null;
}

type Range = "24h" | "7d" | "30d" | "90d" | "1y";

/**
 * Multi-account analytics: combined equity curve (SQL time-bucketing),
 * per-account ranking, best/worst/highest-drawdown. Filters match the
 * account table filters (broker/mode/group/agent/search).
 */
export async function getAnalytics(userId: string, filters: AccountFilters & { range?: Range } = {}): Promise<AnalyticsResult> {
  const range = filters.range ?? "30d";
  const rangeMs: Record<Range, number> = {
    "24h": 86_400_000, "7d": 604_800_000, "30d": 2_592_000_000,
    "90d": 7_776_000_000, "1y": 31_536_000_000,
  };
  const from = new Date(Date.now() - rangeMs[range]);
  const bucket = range === "24h" || range === "7d" ? "hour" : "day";

  const { rows } = await getAccountSummaries(userId, filters);
  const ids = rows.map((r) => r.id);
  const factors = rows.map(r => accountMoneyUnit(r.sourceCurrency).factor);

  const emptyTotals = {
    totalAccounts: 0, online: 0, warning: 0, offline: 0,
    combinedEquity: 0, combinedBalance: 0, combinedFloatingPl: 0,
    combinedDrawdownPct: 0, maxDrawdownPct: 0, openPositions: 0,
  };
  if (!ids.length) {
    return { currencies: [], totals: emptyTotals, series: [], ranking: [], best: null, worst: null, highestDrawdown: null };
  }

  const currencies = [...new Set(rows.map(r => r.currency))];
  const mixed = currencies.length > 1;
  const bucketed =
    mixed ? [] : await prisma.$queryRaw<{ t: Date; equity: number; balance: number }[]>`
      WITH buckets AS (
        SELECT generate_series(date_trunc(${bucket}, ${from}::timestamp),
          date_trunc(${bucket}, NOW()::timestamp), ('1 ' || ${bucket})::interval) AS t
      )
      SELECT b.t, SUM(s.equity * a.factor)::float AS equity, SUM(s.balance * a.factor)::float AS balance
      FROM buckets b CROSS JOIN unnest(${ids}::text[], ${factors}::float8[]) AS a(id, factor)
      JOIN LATERAL (
        SELECT equity, balance FROM equity_snapshots
        WHERE "accountId" = a.id AND at < b.t + ('1 ' || ${bucket})::interval
        ORDER BY at DESC LIMIT 1
      ) s ON true
      GROUP BY b.t ORDER BY b.t
    `;

  // Anchor the curve with a starting point from the earliest available equity.
  const series = bucketed.map((b) => ({ t: new Date(b.t).toISOString(), equity: Number(b.equity), balance: Number(b.balance) }));
  const combinedDd = drawdown(series.map((p) => ({ at: p.t, equity: p.equity, balance: p.balance })));

  const totals = {
    ...emptyTotals,
    totalAccounts: rows.length,
    online: rows.filter((r) => r.eaStatus === "ONLINE").length,
    warning: rows.filter((r) => r.eaStatus === "WARNING").length,
    offline: rows.filter((r) => r.eaStatus === "OFFLINE").length,
    combinedEquity: mixed ? null : rows.reduce((s, r) => s + r.equity, 0),
    combinedBalance: mixed ? null : rows.reduce((s, r) => s + r.balance, 0),
    combinedFloatingPl: mixed ? null : rows.reduce((s, r) => s + r.floatingPl, 0),
    combinedDrawdownPct: combinedDd.currentPct,
    maxDrawdownPct: combinedDd.maxPct,
    openPositions: rows.reduce((s, r) => s + r.openPositions, 0),
  };

  const ranking = rows
    .map((r) => ({
      accountId: r.id,
      login: r.login,
      broker: r.broker,
      server: r.server,
      mode: r.mode,
      currency: r.currency,
      status: r.eaStatus,
      equity: r.equity,
      balance: r.balance,
      floatingPl: r.floatingPl,
      drawdownPct: r.drawdownPct,
      maxDrawdownPct: r.maxDrawdownPct,
      openPositions: r.openPositions,
    }))
    .sort((a, b) => b.floatingPl - a.floatingPl);

  const byDd = [...rows].sort((a, b) => b.drawdownPct - a.drawdownPct);

  return {
    currencies,
    totals,
    series,
    ranking,
    best: !mixed && ranking.length ? { login: ranking[0].login, floatingPl: ranking[0].floatingPl } : null,
    worst: !mixed && ranking.length ? { login: ranking[ranking.length - 1].login, floatingPl: ranking[ranking.length - 1].floatingPl } : null,
    highestDrawdown: byDd.length ? { login: byDd[0].login, drawdownPct: byDd[0].drawdownPct } : null,
  };
}
