import "server-only";
import { prisma } from "@/lib/database/prisma";
import { evaluateOfflineAlerts } from "@/server/agent/alerts";
import type { RetentionOption } from "@/shared/types";

const RETENTION_DAYS: Record<RetentionOption, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
  unlimited: 0,
};

const DEFAULT_RETENTION: RetentionOption = "90d";

/**
 * Scheduled maintenance (Vercel cron → /api/cron/maintenance):
 *  1. offline alert evaluation while nobody has the dashboard open
 *  2. retention pruning of historical snapshots only
 *  3. infrastructure cleanup (expired sessions/codes, old events, limits)
 *
 * Never deletes: accounts, positions, orders, ea_status, heartbeats,
 * alert_events, groups, settings.
 */
export async function runMaintenance(): Promise<{ snapshotsDeleted: number; infraDeleted: number }> {
  const now = new Date();

  // 1. Offline alerts for every user (cheap: only runs when alerts exist).
  try {
    await evaluateOfflineAlerts();
  } catch (err) {
    console.error("[maintenance:offline]", err);
  }

  // 2. Retention per user setting.
  const retentionSettings = await prisma.setting.findMany({ where: { key: "retention" } });
  const cutoffByUser = new Map<string, Date | null>();
  for (const s of retentionSettings) {
    const period = (s.value as { period?: string })?.period as RetentionOption;
    const days = RETENTION_DAYS[period] ?? RETENTION_DAYS[DEFAULT_RETENTION];
    cutoffByUser.set(s.userId, days > 0 ? new Date(now.getTime() - days * 86_400_000) : null);
  }

  let snapshotsDeleted = 0;
  const users = await prisma.user.findMany({ select: { id: true } });
  for (const u of users) {
    if (cutoffByUser.has(u.id) && cutoffByUser.get(u.id) === null) continue;
    const cutoff = cutoffByUser.get(u.id) ?? new Date(now.getTime() - RETENTION_DAYS[DEFAULT_RETENTION] * 86_400_000);
    const accountIds = (await prisma.account.findMany({ where: { userId: u.id }, select: { id: true } })).map((a) => a.id);
    if (!accountIds.length) continue;

    const [eq, snap] = await prisma.$transaction([
      prisma.equitySnapshot.deleteMany({ where: { accountId: { in: accountIds }, at: { lt: cutoff } } }),
      prisma.accountSnapshot.deleteMany({ where: { accountId: { in: accountIds }, at: { lt: cutoff } } }),
    ]);
    snapshotsDeleted += eq.count + snap.count;
  }

  // 3. Infrastructure cleanup.
  const [sessions, codes, events, limits] = await prisma.$transaction([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.pairingCode.deleteMany({ where: { usedAt: null, expiresAt: { lt: new Date(now.getTime() - 86_400_000) } } }),
    prisma.realtimeEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } } }),
    prisma.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 24 * 3600_000) } } }),
  ]);
  const infraDeleted = sessions.count + codes.count + events.count + limits.count;

  return { snapshotsDeleted, infraDeleted };
}
