import "server-only";
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
    totalDrawdownPct: number;
    openPositions: number;
  };
}> {
  const emptyTotals = {
    currencies: [] as string[],
    totalAccounts: 0, online: 0, warning: 0, offline: 0,
    totalBalance: 0, totalEquity: 0, floatingPl: 0, todayRealizedPl: 0, realizedReportingAccounts: 0,
    totalDrawdownPct: 0, openPositions: 0,
  };

  const now = new Date();

  const accounts = await prisma.account.findMany({
    where: {
      userId,
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
              { displayName: { contains: filters.q, mode: "insensitive" } },
              { login: { contains: filters.q, mode: "insensitive" } },
              { broker: { contains: filters.q, mode: "insensitive" } },
              { server: { contains: filters.q, mode: "insensitive" } },
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
  });

  if (!accounts.length) return { rows: [], totals: emptyTotals };
  const ids = accounts.map((a) => a.id);

  const openRows = await prisma.position.groupBy({
    by: ["accountId"], where: { accountId: { in: ids } }, _count: { _all: true },
  });
  const openMap = new Map(openRows.map((r) => [r.accountId, r._count._all]));

  const rows: AccountSummary[] = accounts.map((a) => {
    const unit = accountMoneyUnit(a.currency);
    const floatingPl = (a.equity - a.balance - a.credit) * unit.factor;
    const dd = { peak: a.equityPeak, maxDdPct: a.maxDrawdownPct };
    const currentDd = dd && dd.peak > 0 ? Math.max(0, ((dd.peak - a.equity) / dd.peak) * 100) : 0;
    const revoked = a.agent?.status === "REVOKED";
    const lastBeat = revoked || !a.agentId || !a.terminalConnected ? null : a.lastHeartbeatAt;
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
      drawdownPct: currentDd,
      maxDrawdownPct: dd?.maxDdPct ?? 0,
      openPositions: openMap.get(a.id) ?? 0,
      agentId: a.agentId,
      agentName: a.agent ? (revoked ? `${a.agent.name} (revoked)` : a.agent.name) : null,
      groups: a.groupLinks.map((g) => g.group),
      updatedAt: a.updatedAt.toISOString(),
    };
  });

  const filtered = filters.status ? rows.filter((r) => r.eaStatus === filters.status) : rows;
  sortRows(filtered, filters.sort ?? "account", filters.dir ?? "asc");

  const currencies = [...new Set(rows.map(r => r.currency))];
  const mixed = currencies.length > 1;
  const totals = {
    currencies,
    todayRealizedPl: mixed || rows.some(r => r.todayRealizedPl === null) ? null : rows.reduce((s, r) => s + r.todayRealizedPl!, 0),
    realizedReportingAccounts: rows.filter(r => r.todayRealizedPl !== null).length,
    totalAccounts: rows.length,
    online: rows.filter((r) => r.eaStatus === "ONLINE").length,
    warning: rows.filter((r) => r.eaStatus === "WARNING").length,
    offline: rows.filter((r) => r.eaStatus === "OFFLINE").length,
    totalBalance: mixed ? null : rows.reduce((s, r) => s + r.balance, 0),
    totalEquity: mixed ? null : rows.reduce((s, r) => s + r.equity, 0),
    floatingPl: mixed ? null : rows.reduce((s, r) => s + r.floatingPl, 0),
    totalDrawdownPct: rows.reduce((s, r) => Math.max(s, r.drawdownPct), 0),
    openPositions: rows.reduce((s, r) => s + r.openPositions, 0),
  };

  return { rows: filtered, totals };
}

const STATUS_ORDER: Record<string, number> = { ONLINE: 0, WARNING: 1, OFFLINE: 2 };

export function sortRows(rows: AccountSummary[], sort: string, dir: "asc" | "desc"): void {
  const mul = dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    if (sort === "status") return mul * (STATUS_ORDER[a.eaStatus] - STATUS_ORDER[b.eaStatus]) || compareAccountIdentity(a,b);
    if (sort === "account") return mul * compareAccountIdentity(a,b);
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

