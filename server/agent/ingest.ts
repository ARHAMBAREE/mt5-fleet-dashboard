import "server-only";
import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/auth/guard";
import { prisma } from "@/lib/database/prisma";
import type {
  AgentAccountInfo,
  
  AgentOrderDto,
  AgentPositionDto,
} from "@/shared/protocol";
import { publishThrottled } from "@/server/realtime/notify";

const EPOCH = (sec: number) => new Date(Math.max(0, Math.floor(sec)) * 1000);

/** Find or create the account row for this login+server under the agent's user. */
export async function resolveAccount(agent: { id: string; userId: string }, acc: AgentAccountInfo) {
  const key = { userId: agent.userId, login: acc.login, server: acc.server };
  const existing = await prisma.account.findUnique({ where: { userId_login_server: key } });
  if (existing) return existing;
  return prisma.account.upsert({
    where: { userId_login_server: key }, update: {},
    create: {
      ...key,
      broker: acc.broker || "Unknown",
      currency: acc.currency,
      mode: acc.mode,
      agentId: agent.id,
    },
  });
}

/**
 * Persist one account snapshot: latest state + snapshot series + EA status.
 * PostgreSQL is the single source of truth; published events are throttled
 * invalidation hints, not state.
 */
export async function ingestSnapshot(agent: { id: string; userId: string }, acc: AgentAccountInfo) {
  const account = await resolveAccount(agent, acc);

  const now = new Date();
  const floatingPl = acc.equity - acc.balance - acc.credit;

  const updated = await prisma.$transaction(async (prisma) => {
  await prisma.$queryRaw`SELECT id FROM accounts WHERE id = ${account.id} FOR UPDATE`;
  const previous = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
  const equityPeak = Math.max(previous.equityPeak, acc.equity);
  const maxDrawdownPct = Math.max(previous.maxDrawdownPct, equityPeak > 0 ? (equityPeak - acc.equity) / equityPeak * 100 : 0);
  const updated = await prisma.account.update({
    where: { id: account.id },
    data: {
      equityPeak, maxDrawdownPct,
      agentId: agent.id,
      broker: acc.broker || account.broker,
      currency: acc.currency,
      mode: acc.mode,
      balance: acc.balance,
      equity: acc.equity,
      credit: acc.credit,
      margin: acc.margin,
      freeMargin: acc.freeMargin,
      marginLevel: acc.marginLevel,
      leverage: acc.leverage,
      tradeAllowed: acc.tradeAllowed,
      algoTrading: acc.algoTrading,
      terminalConnected: acc.terminalConnected,
      lastHeartbeatAt: now,
      snapshotAt: now,
    },
  });

  await Promise.all([
    prisma.accountSnapshot.create({
      data: {
        accountId: account.id,
        balance: acc.balance,
        equity: acc.equity,
        floatingPl,
        margin: acc.margin,
        freeMargin: acc.freeMargin,
        marginLevel: acc.marginLevel,
      },
    }),
    // Equity samples throttled to 1/minute per account to bound storage.
    prisma.$executeRaw`
      INSERT INTO equity_snapshots (id, "accountId", at, equity, balance)
      SELECT ${randomUUID()}, ${account.id}, ${now}, ${acc.equity}, ${acc.balance}
      WHERE NOT EXISTS (
        SELECT 1 FROM equity_snapshots e
        WHERE e."accountId" = ${account.id} AND e.at > ${new Date(now.getTime() - 60_000)}
      )`,
    prisma.eaStatus.upsert({
      where: { accountId: account.id },
      create: {
        accountId: account.id,
        eaLoaded: true,
        terminalConnected: acc.terminalConnected,
        algoTrading: acc.algoTrading,
        lastHeartbeatAt: now,
      },
      update: {
        eaLoaded: true,
        terminalConnected: acc.terminalConnected,
        algoTrading: acc.algoTrading,
        lastHeartbeatAt: now,
        message: null,
      },
    }),
  ]);

  const systemGroups = await prisma.group.findMany({ where: { userId: agent.userId, isSystem: true } });
  await prisma.accountGroup.deleteMany({ where: { accountId: account.id, groupId: { in: systemGroups.filter(g => g.name !== acc.mode).map(g => g.id) } } });
  const group = systemGroups.find(g => g.name === acc.mode);
  if (group) await prisma.accountGroup.upsert({ where: { accountId_groupId: { accountId: account.id, groupId: group.id } }, create: { accountId: account.id, groupId: group.id }, update: {} });
  return updated;
  });
  await publishThrottled(agent.userId, "accounts:update", { accountIds: [account.id] });
  return { account: updated, floatingPl };
}

/** Merge a position sync (changed set + removals, or a full reconciliation). */
export async function syncPositions(
  account: { id: string; userId: string },
  payload: { full: boolean; positions: AgentPositionDto[]; removed?: (string | number)[] }
) {
  await prisma.$transaction(async (prisma) => {
  const incoming = payload.positions;

  if (payload.full) {
    const keep = incoming.map((p) => String(p.ticket));
    await prisma.position.deleteMany({
      where: { accountId: account.id, ...(keep.length ? { ticket: { notIn: keep } } : {}) },
    });
  } else if (payload.removed?.length) {
    await prisma.position.deleteMany({
      where: { accountId: account.id, ticket: { in: payload.removed.map(String) } },
    });
  }

  if (incoming.length) {
    await Promise.all(
      incoming.map((p) =>
        prisma.position.upsert({
          where: { accountId_ticket: { accountId: account.id, ticket: String(p.ticket) } },
          create: {
            accountId: account.id,
            ticket: String(p.ticket),
            symbol: p.symbol,
            type: p.type === "SELL" ? "SELL" : "BUY",
            volume: p.volume,
            openPrice: p.openPrice,
            currentPrice: p.currentPrice,
            sl: p.sl,
            tp: p.tp,
            swap: p.swap,
            commission: p.commission,
            profit: p.profit,
            magic: String(p.magic),
            comment: (p.comment ?? "").slice(0, 255),
            openTime: EPOCH(p.openTime),
          },
          update: {
            symbol: p.symbol,
            type: p.type === "SELL" ? "SELL" : "BUY",
            volume: p.volume,
            openPrice: p.openPrice,
            currentPrice: p.currentPrice,
            sl: p.sl,
            tp: p.tp,
            swap: p.swap,
            commission: p.commission,
            profit: p.profit,
            magic: String(p.magic),
            comment: (p.comment ?? "").slice(0, 255),
          },
        })
      )
    );
  }

  });
  await publishThrottled(account.userId, "accounts:update", { accountIds: [account.id] });
}

export async function syncOrders(
  account: { id: string; userId: string },
  payload: { full: boolean; orders: AgentOrderDto[]; removed?: (string | number)[] }
) {
  await prisma.$transaction(async (prisma) => {
  const incoming = payload.orders;

  if (payload.full) {
    const keep = incoming.map((o) => String(o.ticket));
    await prisma.order.deleteMany({
      where: { accountId: account.id, ...(keep.length ? { ticket: { notIn: keep } } : {}) },
    });
  } else if (payload.removed?.length) {
    await prisma.order.deleteMany({
      where: { accountId: account.id, ticket: { in: payload.removed.map(String) } },
    });
  }

  if (incoming.length) {
    await Promise.all(
      incoming.map((o) =>
        prisma.order.upsert({
          where: { accountId_ticket: { accountId: account.id, ticket: String(o.ticket) } },
          create: {
            accountId: account.id,
            ticket: String(o.ticket),
            symbol: o.symbol,
            type: o.type,
            volume: o.volume,
            price: o.price,
            sl: o.sl,
            tp: o.tp,
            magic: String(o.magic),
            comment: (o.comment ?? "").slice(0, 255),
            createTime: EPOCH(o.createTime),
          },
          update: {
            symbol: o.symbol,
            type: o.type,
            volume: o.volume,
            price: o.price,
            sl: o.sl,
            tp: o.tp,
            magic: String(o.magic),
            comment: (o.comment ?? "").slice(0, 255),
          },
        })
      )
    );
  }
  });
  await publishThrottled(account.userId, "accounts:update", { accountIds: [account.id] });
}


/** Only a snapshot may bind an account; never invent an empty-server account. */
export async function boundAccount(agent: { id: string; userId: string }, login: string, server: string) {
  const account = await prisma.account.findFirst({ where: {
    userId: agent.userId, agentId: agent.id, login, server,
  } });
  if (!account) throw new ApiError(409, "SNAPSHOT_REQUIRED", "Send an account snapshot before trading records");
  return account;
}
