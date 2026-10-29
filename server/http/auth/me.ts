import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getEffectiveFleetUserId } from "@/lib/auth/fleet-user";
import { prisma } from "@/lib/database/prisma";
import { deriveEaStatus } from "@/lib/status";

/** GET /api/auth/me — current session + app bootstrap payload. */
export async function GET(req: NextRequest): Promise<Response> {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });

  const fleetUserId = await getEffectiveFleetUserId(user);

  const [settings, unack, accountCount] = await Promise.all([
    prisma.setting.findMany({ where: { userId: fleetUserId } }),
    prisma.alertEvent.count({ where: { userId: fleetUserId, acknowledgedAt: null } }),
    prisma.account.count({ where: { userId: fleetUserId } }),
  ]);

  // Quick fleet heartbeat so the shell can paint status immediately.
  const recent = await prisma.account.findMany({
    where: { userId: fleetUserId },
    select: { lastHeartbeatAt: true },
    take: 500,
  });
  const now = Date.now();
  const online = recent.filter((a) => deriveEaStatus(a.lastHeartbeatAt, now) === "ONLINE").length;

  return NextResponse.json({
    ok: true,
    authenticated: true,
    user,
    settings: settings.reduce<Record<string, unknown>>((acc, s) => ({ ...acc, [s.key]: s.value }), {}),
    counts: { accounts: accountCount, online, unacknowledgedAlerts: unack },
  });
}
