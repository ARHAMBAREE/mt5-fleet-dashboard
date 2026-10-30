import "server-only";
import { z } from "zod";

/** Strip control characters and cap length — applied to all free-text input. */
export const cleanString = (max = 200) =>
  z
    .string()
    .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
    .pipe(z.string().max(max));

export const cleanOptional = (max = 200) => cleanString(max).optional().or(z.literal("").transform(() => ""));

export const loginSchema = z.object({
  email: z.string().email().max(254).transform((s) => s.toLowerCase().trim()),
  password: z.string().min(1).max(200),
  remember: z.boolean().optional().default(true),
});

export const registerSchema = z.object({
  email: z.string().email().max(254).transform((s) => s.toLowerCase().trim()),
  password: z.string().min(1).max(200),
  name: cleanString(80),
});

export const createUserSchema = z.object({
  email: z.string().email().max(254).transform((s) => s.toLowerCase().trim()),
  password: z.string().min(6).max(200),
  name: cleanString(80),
  role: z.enum(["ADMIN", "VIEWER"]).default("VIEWER"),
});

export const updateUserSchema = z.object({
  role: z.enum(["ADMIN", "VIEWER"]).optional(),
  name: cleanString(80).optional(),
  password: z.string().min(6).max(200).optional(),
});

export const groupSchema = z.object({
  name: cleanString(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#3b82f6"),
});

export const accountGroupLinkSchema = z.object({
  groupId: z.string().uuid(),
});

export const alertSchema = z.object({
  name: cleanString(80).optional(),
  type: z.enum([
    "ACCOUNT_OFFLINE", "EA_OFFLINE",
    "MARGIN_LEVEL_LOW", "ALGO_TRADING_DISABLED", "LARGE_POSITION", "LARGE_LOSS", "LARGE_PROFIT",
  ]),
  enabled: z.boolean().default(true),
  threshold: z.number().finite().min(0).max(1_000_000_000),
  accountId: z.string().uuid().nullable().optional(),
  cooldownSeconds: z.number().int().min(30).max(86_400).default(300),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]).default("WARNING"),
});

export const settingsSchema = z.object({
  key: z.enum(["retention", "notifications", "thresholds", "display", "desktop"]),
  value: z.record(z.string(), z.unknown()),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
});

export const exportQuerySchema = z.object({
  type: z.enum(["accounts", "positions", "orders", "analytics"]),
  format: z.enum(["csv", "json"]).default("csv"),
  accountId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

/** Escape a value for CSV; quote when necessary. */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const raw = String(v);
  const s = typeof v === "string" && /^[=+@\-\t\r]/.test(raw) ? "'" + raw : raw;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\r\n");
}

export const fleetQuerySchema = z.object({
  q: z.string().max(200).optional(), mode: z.enum(["LIVE", "DEMO"]).optional(),
  groupId: z.string().max(64).optional(), broker: z.string().max(120).optional(),
  server: z.string().max(120).optional(), currency: z.string().max(12).optional(),
  accountId: z.string().uuid().optional(), symbol: z.string().max(64).optional(),
  agentId: z.string().uuid().optional(), status: z.enum(["ONLINE", "WARNING", "OFFLINE"]).optional(),
  sort: z.string().max(64).optional(), dir: z.enum(["asc", "desc"]).default("asc"),
  range: z.enum(["24h", "7d", "30d", "90d", "1y"]).default("30d"),
});

// ---------------------------------------------------------------------------
// EA Licensing Schemas
// ---------------------------------------------------------------------------

export const verifyLicenseSchema = z.object({
  licenseKey: z.string().min(1).max(64),
  accountNumber: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
});

export const createLicenseSchema = z.object({
  expiryDays: z.number().int().min(1).max(3650).optional().default(365),
  expiryDate: z.string().datetime().optional(),
  accountNumber: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).nullable().optional(),
  notes: cleanOptional(200),
  count: z.number().int().min(1).max(50).optional().default(1),
});

export const updateLicenseSchema = z.object({
  isActive: z.boolean().optional(),
  expiryDate: z.string().datetime().optional(),
  accountNumber: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).nullable().optional(),
  notes: cleanOptional(200),
});

