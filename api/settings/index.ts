import type { Prisma } from "@prisma/client";
import { ApiError, readJson, withAuth } from "@/lib/auth/guard";
import { prisma } from "@/lib/database/prisma";
import { z } from "zod";
import { RETENTION_OPTIONS } from "@/shared/types";

export const dynamic = "force-dynamic";

const putSchema = z.object({
  key: z.enum(["retention", "notifications", "thresholds", "display", "desktop"]),
  value: z.record(z.string(), z.unknown()),
});

const retentionSchema = z.object({ period: z.enum(RETENTION_OPTIONS) });

/**
 * GET /api/settings — all settings (with defaults applied)
 * PUT /api/settings — upsert {key, value}
 */
export const GET = withAuth({ limit: { key: "settings", limit: 240, windowSec: 60 } }, async (_req, ctx) => {
  const rows = await prisma.setting.findMany({ where: { userId: ctx.user.id } });
  const map = rows.reduce<Record<string, unknown>>((acc, r) => ({ ...acc, [r.key]: r.value }), {});
  return Response.json({
    settings: {
      retention: map.retention ?? { period: "90d" },
      notifications: map.notifications ?? { browser: true, desktop: true, minSeverity: "INFO" },
      thresholds: map.thresholds ?? {},
      display: map.display ?? { theme: "dark", density: "comfortable" },
      desktop: map.desktop ?? { minimizeToTray: true, startOnBoot: false, notifyEnabled: true },
      ...map,
    },
    retentionOptions: RETENTION_OPTIONS,
  });
});

export const PUT = withAuth({ minRole: "ADMIN", limit: { key: "settings-write", limit: 120, windowSec: 60 } }, async (req, ctx) => {
  const body = await readJson(req, putSchema);
  if (body.key === "retention") retentionSchema.parse(body.value);

  await prisma.setting.upsert({
    where: { userId_key: { userId: ctx.user.id, key: body.key } },
    create: { userId: ctx.user.id, key: body.key, value: body.value as Prisma.InputJsonValue },
    update: { value: body.value as Prisma.InputJsonValue },
  });
  return Response.json({ ok: true });
});
