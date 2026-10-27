import "server-only";
import { prisma } from "@/lib/database/prisma";
import { issueCsrfToken } from "@/lib/auth/csrf";
import { GROUP_SEEDS, DEFAULT_ALERT_THRESHOLDS, type AlertType, type RetentionOption } from "@/shared/types";
import { randomToken, sha256Hex } from "@/lib/security/crypto";

const GROUP_COLORS: Record<string, string> = {
  LIVE: "#22c55e", DEMO: "#3b82f6", GOLD: "#eab308", FOREX: "#06b6d4",
  "BOT A": "#a855f7", "BOT B": "#ec4899", "HIGH RISK": "#ef4444", "LOW RISK": "#10b981",
};

/**
 * Bootstrap everything a new user needs: default groups, default alert
 * rules (disabled until tuned), and default settings. Idempotent.
 */
export async function bootstrapUser(userId: string): Promise<void> {
  await prisma.group.createMany({
    data: GROUP_SEEDS.map((name) => ({
      userId,
      name,
      color: GROUP_COLORS[name] ?? "#3b82f6",
      isSystem: name === "LIVE" || name === "DEMO",
    })),
    skipDuplicates: true,
  });

  const existing = await prisma.alert.count({ where: { userId } });
  if (existing === 0) {
    await prisma.alert.createMany({
      data: (Object.keys(DEFAULT_ALERT_THRESHOLDS) as AlertType[]).map((type) => ({
        userId,
        name: type.replace(/_/g, " ").toLowerCase(),
        type,
        threshold: DEFAULT_ALERT_THRESHOLDS[type],
        enabled: false, // opt-in after thresholds are tuned
        severity:
          type === "MARGIN_LEVEL_LOW"
            ? ("CRITICAL" as const)
            : ("WARNING" as const),
      })),
    });
  }

  await prisma.setting.upsert({
    where: { userId_key: { userId, key: "retention" } },
    create: { userId, key: "retention", value: { period: "90d" as RetentionOption } },
    update: {},
  });
  await prisma.setting.upsert({
    where: { userId_key: { userId, key: "notifications" } },
    create: { userId, key: "notifications", value: { browser: true, desktop: true, minSeverity: "INFO" } },
    update: {},
  });
}

/** CSRF token bound to a fresh session token (returned at login/register). */
export function csrfForSession(sessionToken: string): string {
  return issueCsrfToken(sessionToken);
}

/** Opaque API token helper used by exports/debug (32 bytes, hashed at rest). */
export function newOpaqueToken() {
  const token = randomToken(32);
  return { token, hash: sha256Hex(token) };
}
