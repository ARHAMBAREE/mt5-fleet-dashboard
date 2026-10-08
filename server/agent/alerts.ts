import "server-only";
import { prisma } from "@/lib/database/prisma";
import { publishEvent } from "@/lib/realtime/publish";
import type { Alert } from "@prisma/client";

interface FireInput {
  alert: Alert;
  accountId: string | null;
  accountLabel: string;
  value: number;
  message: string;
  cooldown: boolean; // enforce cooldown (threshold) vs once-per-outage (offline)
  dedupeSuffix?: string;
}

async function fire({ alert, accountId, accountLabel, value, message, cooldown, dedupeSuffix }: FireInput) {
  const now = Date.now();
  if (cooldown) {
    const recent = await prisma.alertEvent.findFirst({
      where: { alertId: alert.id, accountId, triggeredAt: { gt: new Date(now - alert.cooldownSeconds * 1000) } },
      orderBy: { triggeredAt: "desc" },
      select: { id: true },
    });
    if (recent) return;
  }
  // Unique dedupeKey is the race-proof backstop against duplicate events.
  const key = `${alert.id}:${accountId ?? "all"}:${dedupeSuffix ?? Math.floor(now / (alert.cooldownSeconds * 1000))}`;
  try {
    const ev = await prisma.alertEvent.create({
      data: {
        alertId: alert.id, accountId, userId: alert.userId, type: alert.type,
        severity: alert.severity, value, threshold: alert.threshold, message, dedupeKey: key,
      },
    });
    await publishEvent(alert.userId, "alerts:new", {
      id: ev.id, type: ev.type, severity: ev.severity, message: ev.message,
      accountId: ev.accountId, accountLabel, value: ev.value, threshold: ev.threshold,
      triggeredAt: ev.triggeredAt.toISOString(),
    });
  } catch (err) {
    if ((err as { code?: string }).code !== "P2002") throw err; // expected race
  }
}

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Evaluate threshold alerts for one account after each snapshot/position sync. */
export async function evaluateAccountAlerts(accountId: string): Promise<void> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return;

  const alerts = await prisma.alert.findMany({
    where: { userId: account.userId, enabled: true, type: { not: "DAILY_LOSS_EXCEEDED" }, OR: [{ accountId: null }, { accountId }] },
  });
  if (!alerts.length) return;

  const label = `${account.login} (${account.broker})`;
  const now = new Date();
  const needs = (t: string) => alerts.some((a) => a.type === t);

  let ddPct = 0;
  if (needs("DRAWDOWN_EXCEEDED")) {
    ddPct = account.equityPeak > 0 ? Math.max(0, (account.equityPeak - account.equity) / account.equityPeak * 100) : 0;
  }

  let maxVolume = 0, worstLoss = 0, bestProfit = 0;
  if (needs("LARGE_POSITION") || needs("LARGE_LOSS") || needs("LARGE_PROFIT")) {
    const positions = await prisma.position.findMany({
      where: { accountId },
      select: { volume: true, profit: true },
    });
    for (const p of positions) {
      maxVolume = Math.max(maxVolume, p.volume);
      worstLoss = Math.min(worstLoss, p.profit);
      bestProfit = Math.max(bestProfit, p.profit);
    }
  }

  for (const alert of alerts) {
    if (alert.type === "DRAWDOWN_EXCEEDED" && ddPct >= alert.threshold) {
      await fire({ alert, accountId, accountLabel: label, value: ddPct, cooldown: true,
        message: `Drawdown ${fmt(ddPct)}% exceeded ${fmt(alert.threshold)}% on ${label}` });
    } else if (alert.type === "MARGIN_LEVEL_LOW" && account.marginLevel > 0 && account.marginLevel < alert.threshold) {
      await fire({ alert, accountId, accountLabel: label, value: account.marginLevel, cooldown: true,
        message: `Margin level ${fmt(account.marginLevel)}% below ${fmt(alert.threshold)}% on ${label}` });
    } else if (alert.type === "ALGO_TRADING_DISABLED" && !account.algoTrading) {
      await fire({ alert, accountId, accountLabel: label, value: 0, cooldown: true,
        message: `Algo Trading disabled on ${label}` });
    } else if (alert.type === "LARGE_POSITION" && maxVolume >= alert.threshold) {
      await fire({ alert, accountId, accountLabel: label, value: maxVolume, cooldown: true,
        message: `Position volume ${fmt(maxVolume)} lots ≥ ${fmt(alert.threshold)} on ${label}` });
    } else if (alert.type === "LARGE_LOSS" && worstLoss <= -Math.abs(alert.threshold)) {
      await fire({ alert, accountId, accountLabel: label, value: worstLoss, cooldown: true,
        message: `Floating loss ${fmt(worstLoss)} ≤ −${fmt(Math.abs(alert.threshold))} on ${label}` });
    } else if (alert.type === "LARGE_PROFIT" && bestProfit >= alert.threshold) {
      await fire({ alert, accountId, accountLabel: label, value: bestProfit, cooldown: true,
        message: `Floating profit ${fmt(bestProfit)} ≥ ${fmt(alert.threshold)} on ${label}` });
    }
  }
}

/**
 * Offline detection (status itself is derived at read time: >10s WARNING,
 * >30s OFFLINE). Each outage produces exactly one event — the dedupe key is
 * bound to the last-seen timestamp, so recovery + new outage re-fires.
 */
export async function evaluateOfflineAlerts(userId?: string): Promise<void> {
  const alerts = await prisma.alert.findMany({
    where: {
      enabled: true,
      type: { in: ["ACCOUNT_OFFLINE", "EA_OFFLINE"] },
      ...(userId ? { userId } : {}),
    },
  });
  if (!alerts.length) return;

  const byUser = new Map<string, typeof alerts>();
  for (const a of alerts) {
    byUser.set(a.userId, [...(byUser.get(a.userId) ?? []), a]);
  }

  for (const [uid, list] of byUser) {
    const accounts = await prisma.account.findMany({
      where: { userId: uid },
      select: {
        id: true, login: true, broker: true, lastHeartbeatAt: true,
        eaStatus: { select: { lastHeartbeatAt: true } },
      },
    });

    for (const alert of list) {
      const targets = alert.accountId ? accounts.filter((a) => a.id === alert.accountId) : accounts;
      for (const acc of targets) {
        const ref = alert.type === "EA_OFFLINE" ? acc.eaStatus?.lastHeartbeatAt ?? null : acc.lastHeartbeatAt;
        const ageMs = ref ? Date.now() - ref.getTime() : Number.MAX_SAFE_INTEGER;
        if (ageMs < alert.threshold * 1000) continue;

        const label = `${acc.login} (${acc.broker})`;
        const seconds = ref ? Math.round(ageMs / 1000) : 0;
        await fire({
          alert,
          accountId: acc.id,
          accountLabel: label,
          value: seconds,
          message: ref
            ? `${alert.type === "EA_OFFLINE" ? "EA" : "Account"} offline for ${seconds}s on ${label}`
            : `${alert.type === "EA_OFFLINE" ? "EA" : "Account"} never reported on ${label}`,
          cooldown: false,
          dedupeSuffix: `out:${ref ? ref.getTime() : "never"}`,
        });
      }
    }
  }
}

