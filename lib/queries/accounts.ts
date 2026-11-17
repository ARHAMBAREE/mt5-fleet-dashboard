import "server-only";
import { monthlyValue, readMonthlyPl } from "@/lib/monthly-pl";
import { compareAccountIdentity } from "@/shared/account-order";
import { todayRealized } from "@/lib/daily-pl";
import { accountMoneyUnit } from "@/lib/currency";
import { prisma } from "@/lib/database/prisma";
import { deriveEaStatus } from "@/lib/status";
import type { AccountSummary } from "@/shared/types";

export interface AccountFilters {
  q?: string;
  server?: string;
  currency?: string;
  accountId?: string;
  symbol?: string;
  mode?: "LIVE" | "DEMO";
  groupId?: string;
  broker?: string;
  agentId?: string;
  status?: "ONLINE" | "WARNING" | "OFFLINE";
  botType?: "SAFE" | "AGGRESSIVE" | "ALL";
  sort?: string;
  dir?: "asc" | "desc";
}


/**
 * Dashboard rows with current account metrics and one grouped position count.
 * No per-account N+1 reads or trade-history queries.
 */
export async function getAccountSummaries(userId: string, filters: AccountFilters = {}): Promise<{
  rows: AccountSummary[];
  totals: {
    currencies: string[];
    totalAccounts: number;
    online: number;
    warning: number;
    offline: number;
    totalBalance: number | null;
    totalEquity: number | null;
    floatingPl: number | null;
    todayRealizedPl: number | null;
    realizedReportingAccounts: number;
    monthlyRealizedPl: number | null;
    monthlyReportingAccounts: number;
    monthlyTrackingSince: string | null;
    totalDrawdownPct: number;
    openPositions: number;
  };
}> {
  const emptyTotals = {
    currencies: [] as string[],
    totalAccounts: 0, online: 0, warning: 0, offline: 0,
    totalBalance: 0, totalEquity: 0, floatingPl: 0, todayRealizedPl: 0, realizedReportingAccounts: 0,
    totalDrawdownPct: 0, openPositions: 0, monthlyRealizedPl: 0, monthlyReportingAccounts: 0, monthlyTrackingSince: null,
  };

  const now = new Date();
  void prisma.account.deleteMany({ where: { login: "test-verify" } }).catch(() => {});

  const [accounts, orderSetting, botSetting] = await Promise.all([
    prisma.account.findMany({
      where: {
        userId,
        login: { not: "test-verify" },
        ...(filters.server ? { server: filters.server } : {}),
        ...(filters.currency ? { currency: filters.currency.toUpperCase() === "USD" ? { in: ["USD", "USC"] } : filters.currency } : {}),
        ...(filters.accountId ? { id: filters.accountId } : {}),
        ...(filters.symbol ? { positions: { some: { symbol: filters.symbol } } } : {}),
        ...(filters.mode ? { mode: filters.mode } : {}),
        ...(filters.broker ? { broker: filters.broker } : {}),
        ...(filters.agentId ? { agentId: filters.agentId } : {}),
        ...(filters.q
          ? {
              OR: [
                { displayName: { contains: filters.q } },
                { login: { contains: filters.q } },
                { broker: { contains: filters.q } },
                { server: { contains: filters.q } },
              ],
            }
          : {}),
        ...(filters.groupId && filters.groupId !== "ALL"
          ? { groupLinks: { some: { groupId: filters.groupId } } }
          : {}),
      },
      include: {
        agent: { select: { id: true, name: true, status: true } },
        groupLinks: { include: { group: { select: { id: true, name: true, color: true } } } },
      },
    }),
    prisma.setting.findUnique({
      where: { userId_key: { userId, key: "accountOrder" } },
    }).catch(() => null),
    prisma.setting.findUnique({
      where: { userId_key: { userId, key: "botAssignments" } },
    }).catch(() => null),
  ]);

  if (!accounts.length) return { rows: [], totals: emptyTotals };
  const ids = accounts.map((a) => a.id);

  const rawOrder = (orderSetting?.value as { order?: unknown } | null)?.order;
  const orderList: string[] = Array.isArray(rawOrder)
    ? rawOrder.filter((x): x is string => typeof x === "string")
    : [];

  const rawBot = (botSetting?.value as Record<string, string> | null) ?? {};
  const botMap = typeof rawBot === "object" && rawBot !== null ? rawBot : {};

  const openPositions = await prisma.position.findMany({
    where: { accountId: { in: ids } },
    select: {
      accountId: true,
      type: true,
      tp: true,
      openTime: true,
    },
  });

  const positionsByAccount = new Map<string, { type: "BUY" | "SELL"; tp: number; openTime: Date }[]>();
  for (const pos of openPositions) {
    const list = positionsByAccount.get(pos.accountId) ?? [];
    list.push(pos);
    positionsByAccount.set(pos.accountId, list);
  }

  const rows: AccountSummary[] = accounts.map((a, idx) => {
    const unit = accountMoneyUnit(a.currency);
    const floatingPl = (a.equity - a.balance - a.credit) * unit.factor;
    const dd = { peak: a.equityPeak, maxDdPct: a.maxDrawdownPct };
    const currentDd = dd && dd.peak > 0 ? Math.max(0, ((dd.peak - a.equity) / dd.peak) * 100) : 0;
    const revoked = a.agent?.status === "REVOKED";
    const lastBeat = revoked || !a.agentId ? null : a.lastHeartbeatAt;
    const orderIdx = orderList.indexOf(a.id);
    const sortOrder = orderIdx !== -1 ? orderIdx : (orderList.length > 0 ? 1000 + idx : 0);

    const accPositions = positionsByAccount.get(a.id) ?? [];
    const buyWithTp = accPositions.filter((p) => p.type === "BUY" && p.tp > 0);
    const buyTp = buyWithTp.length > 0
      ? buyWithTp.sort((x, y) => y.openTime.getTime() - x.openTime.getTime())[0].tp
      : null;

    const sellWithTp = accPositions.filter((p) => p.type === "SELL" && p.tp > 0);
    const sellTp = sellWithTp.length > 0
      ? sellWithTp.sort((x, y) => y.openTime.getTime() - x.openTime.getTime())[0].tp
      : null;

    return {
      id: a.id,
      displayName: a.displayName, favorite: a.favorite,
      login: a.login,
      broker: a.broker,
      server: a.server,
      currency: unit.currency,
      sourceCurrency: a.currency,
      mode: a.mode,
      balance: a.balance * unit.factor,
      equity: a.equity * unit.factor,
      credit: a.credit * unit.factor,
      margin: a.margin * unit.factor,
      freeMargin: a.freeMargin * unit.factor,
      marginLevel: a.marginLevel,
      leverage: a.leverage,
      tradeAllowed: a.tradeAllowed,
      algoTrading: a.algoTrading,
      terminalConnected: a.terminalConnected,
      eaStatus: deriveEaStatus(lastBeat, now.getTime()),
      lastHeartbeatAt: lastBeat?.toISOString() ?? null,
      lastSeenLabel: "",
      floatingPl,
      todayRealizedPl: todayRealized(a.todayRealizedPl, a.realizedPlDay, now) === null ? null : a.todayRealizedPl! * unit.factor,
      monthlyRealizedPl: monthlyValue(a.monthlyPl, now) === null ? null : monthlyValue(a.monthlyPl, now)! * unit.factor,
      buyTp,
      sellTp,
      drawdownPct: currentDd,
      maxDrawdownPct: dd?.maxDdPct ?? 0,
      openPositions: accPositions.length,
      agentId: a.agentId,
      agentName: a.agent ? (revoked ? `${a.agent.name} (revoked)` : a.agent.name) : null,
      groups: a.groupLinks.map((g) => g.group),
      botType: (botMap[a.id] === "SAFE" || botMap[a.id] === "AGGRESSIVE" ? botMap[a.id] : null) as "SAFE" | "AGGRESSIVE" | null,
      sortOrder,
      updatedAt: a.updatedAt.toISOString(),
    };
  });

  let filtered = rows;
  if (filters.status) filtered = filtered.filter((r) => r.eaStatus === filters.status);
  if (filters.botType && filters.botType !== "ALL") filtered = filtered.filter((r) => r.botType === filters.botType);
  sortRows(filtered, filters.sort ?? "account", filters.dir ?? "asc");

  const currencies = [...new Set(filtered.map(r => r.currency))];
  const mixed = currencies.length > 1;
  const filteredIds = new Set(filtered.map(r => r.id));
  const filteredAccounts = accounts.filter(a => filteredIds.has(a.id));
  const monthly = filteredAccounts.map(a => ({ value: monthlyValue(a.monthlyPl, now), factor: accountMoneyUnit(a.currency).factor, state: readMonthlyPl(a.monthlyPl) }));
  const starts = monthly.flatMap(m => m.state ? [m.state.startedAt] : []).sort();
  const reportingToday = filtered.filter(r => r.todayRealizedPl !== null);
  const reportingMonthly = monthly.filter(m => m.value !== null);
  const totals = {
    monthlyRealizedPl: mixed || reportingMonthly.length === 0 ? null : reportingMonthly.reduce((sum, m) => sum + m.value! * m.factor, 0),
    monthlyReportingAccounts: reportingMonthly.length,
    monthlyTrackingSince: starts.at(-1) ?? null,
    currencies,
    todayRealizedPl: mixed || reportingToday.length === 0 ? null : reportingToday.reduce((s, r) => s + r.todayRealizedPl!, 0),
    realizedReportingAccounts: reportingToday.length,
    totalAccounts: filtered.length,
    online: filtered.filter((r) => r.eaStatus === "ONLINE").length,
    warning: filtered.filter((r) => r.eaStatus === "WARNING").length,
    offline: filtered.filter((r) => r.eaStatus === "OFFLINE").length,
    totalBalance: mixed ? null : filtered.reduce((s, r) => s + r.balance, 0),
    totalEquity: mixed ? null : filtered.reduce((s, r) => s + r.equity, 0),
    floatingPl: mixed ? null : filtered.reduce((s, r) => s + r.floatingPl, 0),
    totalDrawdownPct: filtered.reduce((s, r) => Math.max(s, r.drawdownPct), 0),
    openPositions: filtered.reduce((s, r) => s + r.openPositions, 0),
  };

  return { rows: filtered, totals };
}

const STATUS_ORDER: Record<string, number> = { ONLINE: 0, WARNING: 1, OFFLINE: 2 };

export function sortRows(rows: AccountSummary[], sort: string, dir: "asc" | "desc"): void {
  const mul = dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    if (sort === "status") return mul * (STATUS_ORDER[a.eaStatus] - STATUS_ORDER[b.eaStatus]) || compareAccountIdentity(a,b);
    if (sort === "account") {
      const orderA = a.sortOrder ?? 0;
      const orderB = b.sortOrder ?? 0;
      if (orderA !== orderB) return mul * (orderA - orderB);
      return mul * compareAccountIdentity(a,b);
    }
    if (sort === "lastSeen") {
      const av = a.lastHeartbeatAt ? Date.parse(a.lastHeartbeatAt) : 0;
      const bv = b.lastHeartbeatAt ? Date.parse(b.lastHeartbeatAt) : 0;
      return mul * (av - bv);
    }
    const av = (a as unknown as Record<string, unknown>)[sort];
    const bv = (b as unknown as Record<string, unknown>)[sort];
    if (typeof av === "string" || typeof bv === "string") {
      return mul * String(av ?? "").localeCompare(String(bv ?? ""));
    }
    return mul * ((av as number) - (bv as number));
  });
}

