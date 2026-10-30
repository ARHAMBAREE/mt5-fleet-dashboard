import crypto from "node:crypto";

/**
 * 32-character unambiguous charset (excludes 0, O, 1, I, L to prevent user confusion).
 */
const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Generate a cryptographically secure 16-character alphanumeric license key.
 * If `formatted` is true, returns as "XXXX-XXXX-XXXX-XXXX".
 */
export function generateLicenseKey(formatted = true): string {
  const bytes = crypto.randomBytes(16);
  let raw = "";
  for (let i = 0; i < 16; i++) {
    raw += CHARSET[bytes[i] % CHARSET.length];
  }

  if (formatted) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
  }
  return raw;
}

/**
 * Normalize an input license key (strip hyphens/whitespace and uppercase).
 */
export function normalizeLicenseKey(key: string): string {
  return (key || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/**
 * Format a 16-character raw key with hyphens (e.g. ABCD-EFGH-JKLM-NPQR).
 */
export function formatLicenseKey(rawKey: string): string {
  const cleaned = normalizeLicenseKey(rawKey);
  if (cleaned.length === 16) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}-${cleaned.slice(8, 12)}-${cleaned.slice(12, 16)}`;
  }
  return cleaned;
}

/**
 * Safely parse an AccountNumber (bigint) from a string or number.
 */
export function parseAccountNumber(value: unknown): bigint | null {
  if (value === null || value === undefined || value === "") return null;
  const str = String(value).trim();
  if (!/^\d+$/.test(str)) return null;
  try {
    return BigInt(str);
  } catch {
    return null;
  }
}

/**
 * Helper to serialize a Prisma License record for JSON response (converting BigInt to Number/String).
 */
export function serializeLicense<T extends { accountNumber: bigint | null }>(license: T) {
  return {
    ...license,
    accountNumber: license.accountNumber !== null ? Number(license.accountNumber) : null,
  };
}

let isTableReady = false;

/**
 * Self-healing / Auto-bootstrap helper: automatically creates the `ea_licenses` table in MySQL/PostgreSQL
 * if it doesn't exist yet on production, preventing 500 database errors without manual intervention.
 */
export async function ensureEaLicensesTable(prismaClient: { $executeRawUnsafe: (query: string) => Promise<unknown> }) {
  if (isTableReady) return;
  try {
    // Primary: MySQL / MariaDB (standard for Hostinger)
    await prismaClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`ea_licenses\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`license_key\` VARCHAR(191) NOT NULL,
        \`account_number\` BIGINT NULL,
        \`is_active\` BOOLEAN NOT NULL DEFAULT true,
        \`expires_at\` DATETIME(3) NULL,
        \`last_verified_at\` DATETIME(3) NULL,
        \`notes\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`created_by_id\` VARCHAR(191) NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`ea_licenses_license_key_key\`(\`license_key\`),
        INDEX \`ea_licenses_account_number_idx\`(\`account_number\`),
        INDEX \`ea_licenses_license_key_is_active_idx\`(\`license_key\`, \`is_active\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
    isTableReady = true;
  } catch (mysqlErr) {
    try {
      // Secondary fallback: PostgreSQL
      await prismaClient.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ea_licenses" (
          "id" VARCHAR(191) NOT NULL,
          "license_key" VARCHAR(191) NOT NULL,
          "account_number" BIGINT NULL,
          "is_active" BOOLEAN NOT NULL DEFAULT true,
          "expires_at" TIMESTAMP(3) NULL,
          "last_verified_at" TIMESTAMP(3) NULL,
          "notes" VARCHAR(191) NULL,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "created_by_id" VARCHAR(191) NULL,
          PRIMARY KEY ("id")
        );
      `);
      isTableReady = true;
    } catch {
      // Table may already exist
    }
  }
}


