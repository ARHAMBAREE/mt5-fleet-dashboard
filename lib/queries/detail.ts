import "server-only";
import { accountMoneyUnit } from "@/lib/currency";
import { prisma } from "@/lib/database/prisma";
import { deriveEaStatus } from "@/lib/status";
import { todayRealized } from "@/lib/daily-pl";
import { monthlyValue } from "@/lib/monthly-pl";
import { aggregatePositions } from "@/lib/calculations/risk";
import type { EquityPoint } from "@/lib/calculations/risk";

export type SeriesRange = "24h" | "7d" | "30d" | "90d" | "1y";

const RANGE_MS: Record<SeriesRange, number> = {
  "24h": 86_400_000, "7d": 604_800_000, "30d": 2_592_000_000,
  "90d": 7_776_000_000, "1y": 31_536_000_000,
};

/** Full account detail: overview + chart series + live risk. */
export async function getAccountDetail(userId: string, accountId: string, range: SeriesRange = "30d") {
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId }, // ownership enforced
    include: {
      eaStatus: true,
      agent: { select: { id: true, name: true, status: true, lastSeenAt: true, platform: true } },
      groupLinks: { include: { group: { select: { id: true, name: true, color: true } } } },
    },
  });
  if (!account) return null;

  const unit = accountMoneyUnit(account.currency);
  const now = new Date();
  const since = new Date(now.getTime() - RANGE_MS[range]);
  const [series, positions, orders] =
    await Promise.all([
      prisma.equitySnapshot.findMany({
        where: { accountId, at: { gte: since } },
        orderBy: { at: "asc" },
        select: { at: true, equity: true, balance: true },
      }),
      prisma.position.findMany({ where: { accountId }, orderBy: { openTime: "asc" } }),
      prisma.order.findMany({ where: { accountId }, orderBy: { createTime: "desc" }, take: 500 }),
    ]);

  const posAgg = aggregatePositions(positions);
  const eq: EquityPoint[] = series.map((p) => ({ at: p.at, equity: p.equity * unit.factor, balance: p.balance * unit.factor }));
  const floating = account.equity - account.balance - account.credit;

  const revoked = account.agent?.status === "REVOKED";
  const lastBeat = revoked || !account.agentId || !account.terminalConnected ? null : account.lastHeartbeatAt;

  return {
    account: {
      id: account.id, displayName: account.displayName, login: account.login, broker: account.broker, server: account.server,
      currency: unit.currency, sourceCurrency: account.currency, mode: account.mode, balance: account.balance * unit.factor, equity: account.equity * unit.factor,
      credit: account.credit * unit.factor, margin: account.margin * unit.factor, freeMargin: account.freeMargin * unit.factor,
      marginLevel: account.marginLevel, leverage: account.leverage, tradeAllowed: account.tradeAllowed,
      algoTrading: account.algoTrading, terminalConnected: account.terminalConnected,
      todayRealizedPl: todayRealized(account.todayRealizedPl, account.realizedPlDay, now) === null ? null : account.todayRealizedPl! * unit.factor,
      monthlyRealizedPl: monthlyValue(account.monthlyPl, now) === null ? null : monthlyValue(account.monthlyPl, now)! * unit.factor,
      lastHeartbeatAt: lastBeat?.toISOString() ?? null,
      snapshotAt: account.snapshotAt?.toISOString() ?? null,
      updatedAt: account.updatedAt.toISOString(),
      groups: account.groupLinks.map((g) => g.group),
      agent: account.agent,
    },
    eaStatus: {
      value: deriveEaStatus(lastBeat, now.getTime()),
      eaLoaded: account.eaStatus?.eaLoaded ?? false,
      terminalConnected: account.eaStatus?.terminalConnected ?? account.terminalConnected,
      algoTrading: account.eaStatus?.algoTrading ?? account.algoTrading,
      build: account.eaStatus?.build ?? null,
      message: account.eaStatus?.message ?? null,
      lastHeartbeatAt: (account.eaStatus?.lastHeartbeatAt ?? lastBeat)?.toISOString() ?? null,
    },
    range,
    series: {
      equity: eq.map((p) => ({ t: iso(p.at), v: p.equity })),
      balance: eq.map((p) => ({ t: iso(p.at), v: p.balance })),
      drawdown: buildDrawdownSeries(eq),
    },
    risk: {
      drawdownPct: account.equityPeak > 0 ? Math.max(0, (account.equityPeak - account.equity) / account.equityPeak * 100) : 0,
      maxDrawdownPct: account.maxDrawdownPct,
      equityPeak: account.equityPeak * unit.factor,
      marginUsagePct: account.equity > 0 ? (account.margin / account.equity) * 100 : 0,
      floatingPl: floating * unit.factor,
      longExposure: posAgg.longExposure,
      shortExposure: posAgg.shortExposure,
      totalExposure: posAgg.totalExposure,
      openCount: posAgg.openCount,
    },
    positions: positions.map(p => ({ ...p, profit: p.profit * unit.factor, swap: p.swap * unit.factor, commission: p.commission * unit.factor })),
    orders,
  };
}

const iso = (d: Date | string | number) =>
  d instanceof Date ? d.toISOString() : typeof d === "string" ? new Date(d).toISOString() : new Date(d).toISOString();

function buildDrawdownSeries(eq: EquityPoint[]) {
  let peak = -Infinity;
  return eq.map((p) => {
    if (p.equity > peak) peak = p.equity;
    const ddPct = peak > 0 ? Math.max(0, ((peak - p.equity) / peak) * 100) : 0;
    return { t: iso(p.at), v: ddPct };
  });
}
