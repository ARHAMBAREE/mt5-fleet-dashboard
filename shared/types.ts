import { z } from "zod";

export const APP_NAME = "MT5 Fleet Dashboard";

/** Connection status derived from heartbeat age (ms) at read time. */
export const ONLINE_WINDOW_MS = 25_000; // < 25s  → ONLINE
export const WARNING_WINDOW_MS = 60_000; // < 60s  → WARNING (after ONLINE)
// >= 60s → OFFLINE (account is never deleted; recovers to ONLINE on resume)

export const DEFAULT_HEARTBEAT_SECONDS = 5;
export const DEFAULT_SNAPSHOT_SECONDS = 5;

/** Data retention options (historical snapshots only). */
export const RETENTION_OPTIONS = ["7d", "30d", "90d", "1y", "unlimited"] as const;
export type RetentionOption = (typeof RETENTION_OPTIONS)[number];

export const ROLES = ["OWNER", "ADMIN", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const ACCOUNT_MODES = ["LIVE", "DEMO"] as const;
export type AccountMode = (typeof ACCOUNT_MODES)[number];

export const EA_STATUSES = ["ONLINE", "WARNING", "OFFLINE", "DISABLED"] as const;
export type EaStatusValue = (typeof EA_STATUSES)[number];

export const POSITION_TYPES = ["BUY", "SELL"] as const;
export type PositionType = (typeof POSITION_TYPES)[number];

export const ORDER_TYPES = [
  "BUY", "SELL", "BUY_LIMIT", "SELL_LIMIT", "BUY_STOP", "SELL_STOP",
  "BUY_STOP_LIMIT", "SELL_STOP_LIMIT", "CLOSE_BY",
] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const HISTORY_TYPES = [...POSITION_TYPES, "OUT", "IN_BY"] as const;

export const ALERT_TYPES = [
  "ACCOUNT_OFFLINE",
  "EA_OFFLINE",
  "MARGIN_LEVEL_LOW",
  "ALGO_TRADING_DISABLED",
  "LARGE_POSITION",
  "LARGE_LOSS",
  "LARGE_PROFIT",
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const DEFAULT_ALERT_THRESHOLDS: Record<AlertType, number> = {
  ACCOUNT_OFFLINE: 30,        // seconds
  EA_OFFLINE: 30,             // seconds
  MARGIN_LEVEL_LOW: 100,      // percent
  ALGO_TRADING_DISABLED: 1,   // boolean flag (1 = enabled alert)
  LARGE_POSITION: 10,         // lots
  LARGE_LOSS: 500,            // currency
  LARGE_PROFIT: 1000,         // currency
};

export const GROUP_SEEDS = [
  "LIVE", "DEMO", "GOLD", "FOREX", "BOT A", "BOT B", "HIGH RISK", "LOW RISK",
] as const;

// ---------------------------------------------------------------------------
// Shared domain DTOs (client ⇄ server contract)
// ---------------------------------------------------------------------------

export const accountSummarySchema = z.object({
  displayName: z.string().nullable(),
  favorite: z.boolean(),
  id: z.string(),
  login: z.string(),
  broker: z.string(),
  server: z.string(),
  currency: z.string(),
  sourceCurrency: z.string(),
  mode: z.enum(ACCOUNT_MODES),
  balance: z.number(),
  equity: z.number(),
  credit: z.number(),
  margin: z.number(),
  freeMargin: z.number(),
  marginLevel: z.number(),
  leverage: z.number(),
  tradeAllowed: z.boolean(),
  algoTrading: z.boolean(),
  terminalConnected: z.boolean(),
  eaStatus: z.enum(EA_STATUSES),
  lastHeartbeatAt: z.string().nullable(),
  lastSeenLabel: z.string(),
  floatingPl: z.number(),
  todayRealizedPl: z.number().nullable(),
  monthlyRealizedPl: z.number().nullable().optional(),
  buyTp: z.number().nullable().optional(),
  sellTp: z.number().nullable().optional(),
  drawdownPct: z.number(),
  maxDrawdownPct: z.number(),
  openPositions: z.number(),
  agentId: z.string().nullable(),
  agentName: z.string().nullable(),
  groups: z.array(z.object({ id: z.string(), name: z.string(), color: z.string() })),
  botType: z.enum(["SAFE", "AGGRESSIVE"]).nullable().optional(),
  sortOrder: z.number().optional().default(0),
  updatedAt: z.string(),
});
export type AccountSummary = z.infer<typeof accountSummarySchema>;

export interface RealtimeEnvelope {
  id: string;           // monotonically increasing per connection scope — used for dedupe
  type: string;         // "accounts:update" | "alerts:new" | "heartbeat" | ...
  ts: number;           // epoch ms
  data: unknown;
}

export const REALTIME_TOPICS = ["accounts", "alerts", "agents", "presence"] as const;
export type RealtimeTopic = (typeof REALTIME_TOPICS)[number];
