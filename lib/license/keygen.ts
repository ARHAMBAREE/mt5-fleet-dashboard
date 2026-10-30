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

