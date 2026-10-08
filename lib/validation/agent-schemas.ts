import { z } from "zod";

const finite = () => z.number().finite();
const ticket = () => z.union([z.string().regex(/^\d{1,20}$/), z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)]);

export const registerSchema = z.object({
  v: z.literal(1),
  pairingCode: z.string().min(9).max(12),
  installationId: z.string().min(8).max(64).regex(/^[A-Za-z0-9-]+$/),
  platform: z.string().max(32).default("windows"),
  terminalBuild: z.number().int().min(0).default(0),
  terminalCompany: z.string().max(120).default(""),
  terminalName: z.string().max(120).default(""),
  eaVersion: z.string().max(32).default(""),
});

export const heartbeatSchema = z.object({
  v: z.literal(1),
  accountLogin: z.string().min(1).max(64),
  server: z.string().min(1).max(120),
  broker: z.string().max(120).default(""),

  terminalConnected: z.boolean(),
  algoTrading: z.boolean(),
  eaLoaded: z.boolean(),
  build: z.number().int().min(0).default(0),
});

export const accountInfoSchema = z.object({
  login: z.string().min(1).max(64),
  broker: z.string().max(120),
  server: z.string().max(120),
  currency: z.string().min(1).max(12),
  balance: finite(),
  equity: finite(),
  credit: finite(),
  margin: finite(),
  freeMargin: finite(),
  marginLevel: finite(),
  leverage: z.number().int().min(0).max(10_000),
  mode: z.enum(["LIVE", "DEMO"]),
  tradeAllowed: z.boolean(),
  algoTrading: z.boolean(),
  terminalConnected: z.boolean(),
});

export const snapshotSchema = z.object({
  v: z.literal(1),
  account: accountInfoSchema,
});

export const positionDtoSchema = z.object({
  ticket: ticket(),
  symbol: z.string().min(1).max(64),
  type: z.enum(["BUY", "SELL"]),
  volume: finite().min(0),
  openPrice: finite(),
  currentPrice: finite(),
  sl: finite(),
  tp: finite(),
  swap: finite(),
  commission: finite(),
  profit: finite(),
  magic: z.union([z.string().regex(/^-?\d{1,20}$/), z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)]),
  comment: z.string().max(255).default(""),
  openTime: z.number().int().min(0),
});

export const positionsSchema = z.object({
  v: z.literal(1),
  accountLogin: z.string().min(1).max(64),
  server: z.string().min(1).max(120),
  full: z.boolean().default(false),
  removed: z.array(ticket()).max(5000).optional(),
  positions: z.array(positionDtoSchema).max(10_000),
});

export const orderDtoSchema = z.object({
  ticket: ticket(),
  symbol: z.string().min(1).max(64),
  type: z.string().min(1).max(40),
  volume: finite().min(0),
  price: finite(),
  sl: finite(),
  tp: finite(),
  magic: z.union([z.string().regex(/^-?\d{1,20}$/), z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)]),
  comment: z.string().max(255).default(""),
  createTime: z.number().int().min(0),
});

export const ordersSchema = z.object({
  v: z.literal(1),
  accountLogin: z.string().min(1).max(64),
  server: z.string().min(1).max(120),
  full: z.boolean().default(false),
  removed: z.array(ticket()).max(5000).optional(),
  orders: z.array(orderDtoSchema).max(10_000),
});

