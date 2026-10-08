import "server-only";
import { prisma } from "@/lib/database/prisma";
import { deriveEaStatus } from "@/lib/status";
import { goldQuote, type GoldTarget } from "@/shared/gold";

export async function getGoldTargets(userId: string): Promise<GoldTarget[]> {
  const positions = await prisma.position.findMany({
    where: {
      account: { userId },
      OR: [{ symbol: { contains: "XAUUSD", mode: "insensitive" } }, { symbol: { startsWith: "GOLD", mode: "insensitive" } }],
    },
    select: {
      id: true, accountId: true, symbol: true, ticket: true, magic: true, type: true,
      volume: true, currentPrice: true, tp: true, updatedAt: true,
      account: { select: { login: true, server: true, terminalConnected: true, lastHeartbeatAt: true, agent: { select: { status: true } } } },
    },
    orderBy: [{ accountId: "asc" }, { ticket: "asc" }],
  });
  return positions.filter(p => goldQuote(p.symbol) === "USD").map(({ account, ...p }) => ({
    ...p, updatedAt: p.updatedAt.toISOString(), login: account.login, server: account.server,
    online: !!account.agent && account.agent.status !== "REVOKED" && account.terminalConnected && deriveEaStatus(account.lastHeartbeatAt) === "ONLINE",
  }));
}
