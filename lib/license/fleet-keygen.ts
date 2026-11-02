import { prisma } from "@/lib/database/prisma";

let tableEnsured = false;

/**
 * Ensures the `mt5_fleet_licenses` table exists and the two required test keys are seeded.
 * Runs idempotently on first call so deployment requires no manual SQL migrations.
 */
export async function ensureMt5FleetLicensesTable(): Promise<void> {
  if (tableEnsured) return;

  try {
    // 1. Create table if not exists (MySQL)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`mt5_fleet_licenses\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`license_key\` VARCHAR(64) NOT NULL UNIQUE,
        \`status\` VARCHAR(20) NOT NULL DEFAULT 'unclaimed',
        \`bound_account_login\` BIGINT NULL,
        \`bound_account_server\` VARCHAR(128) NULL,
        \`bound_at\` DATETIME(3) NULL,
        \`expires_at\` DATETIME(3) NULL,
        \`last_check_in_at\` DATETIME(3) NULL,
        \`last_symbol\` VARCHAR(32) NULL,
        \`last_ip\` VARCHAR(45) NULL,
        \`check_in_count\` INT NOT NULL DEFAULT 0,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX \`idx_mt5_fleet_bound_login\` (\`bound_account_login\`),
        INDEX \`idx_mt5_fleet_license_status\` (\`license_key\`, \`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Seed test key 1: IV-FLEET-2026-GOLD01 (expires 365 days from now)
    const goldKey = "IV-FLEET-2026-GOLD01";
    const existingGold = await prisma.mt5FleetLicense.findUnique({
      where: { licenseKey: goldKey },
    });

    if (!existingGold) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);
      await prisma.mt5FleetLicense.create({
        data: {
          licenseKey: goldKey,
          status: "unclaimed",
          expiresAt,
        },
      });
    }

    // 3. Seed test key 2: IV-FLEET-LIFETIME-99 (lifetime, expires_at = null)
    const lifetimeKey = "IV-FLEET-LIFETIME-99";
    const existingLifetime = await prisma.mt5FleetLicense.findUnique({
      where: { licenseKey: lifetimeKey },
    });

    if (!existingLifetime) {
      await prisma.mt5FleetLicense.create({
        data: {
          licenseKey: lifetimeKey,
          status: "unclaimed",
          expiresAt: null,
        },
      });
    }

    tableEnsured = true;
  } catch (err) {
    // If table already exists or concurrent creation occurs, log and don't crash
    console.error("[ensureMt5FleetLicensesTable] notice:", err);
  }
}

/**
 * Strips trailing \0 null bytes (common in MQL5 StringToCharArray), BOM characters, and whitespace.
 */
export function sanitizeMql5Payload(rawText: string): string {
  if (!rawText) return "";
  return rawText.replace(/\0+$/g, "").replace(/^\uFEFF/, "").trim();
}

/**
 * Coerces account_login to BigInt safely from string or number.
 * Returns null if negative, non-numeric, or missing.
 */
export function parseAccountLogin(val: unknown): bigint | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (!/^\d+$/.test(str)) return null;
  try {
    const num = BigInt(str);
    return num > 0n ? num : null;
  } catch {
    return null;
  }
}

/**
 * In-memory sliding window rate limiter: 30 requests per 60 seconds per IP.
 */
interface RateLimitBucket {
  count: number;
  resetAt: number;
}
const rateLimitMap = new Map<string, RateLimitBucket>();

export function checkFleetRateLimit(ip: string, limit = 30, windowSec = 60): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const bucket = rateLimitMap.get(ip);

  if (!bucket || now > bucket.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowSec * 1000 });
    return { allowed: true, remaining: limit - 1 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count };
}

/** Periodic cleanup for stale rate limit keys every 5 minutes */
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, bucket] of rateLimitMap.entries()) {
      if (now > bucket.resetAt) {
        rateLimitMap.delete(ip);
      }
    }
  }, 5 * 60 * 1000).unref?.();
}

