import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { latestEventId } from "@/lib/realtime/publish";
import { deriveEaStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

/**
 * GET /api/realtime/state — resynchronization payload after (re)connect.
 * Clients receive the durable cursor + fleet counters and then re-fetch
 * their page data through the normal REST endpoints.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });

  const cursor = await latestEventId(user.id);
  const [accounts, unack, agents] = await Promise.all([
    prisma.account.findMany({
      where: { userId: user.id },
      select: { id: true, lastHeartbeatAt: true, updatedAt: true },
      take: 1000,
    }),
    prisma.alertEvent.count({ where: { userId: user.id, acknowledgedAt: null } }),
    prisma.agent.findMany({
      where: { userId: user.id },
      select: { id: true, status: true, lastSeenAt: true },
    }),
  ]);

  const now = Date.now();
  const statusCounts = { ONLINE: 0, WARNING: 0, OFFLINE: 0, DISABLED: 0 };
  let latestUpdate = 0;
  for (const a of accounts) {
    statusCounts[deriveEaStatus(a.lastHeartbeatAt, now)] += 1;
    latestUpdate = Math.max(latestUpdate, a.updatedAt.getTime());
  }

  return NextResponse.json({
    ok: true,
    cursor: cursor?.toString() ?? null,
    serverTime: now,
    counts: {
      accounts: accounts.length,
      ...statusCounts,
      unacknowledgedAlerts: unack,
      activeAgents: agents.filter((a) => a.status === "ACTIVE").length,
      revokedAgents: agents.filter((a) => a.status === "REVOKED").length,
    },
    latestUpdate,
  });
}
