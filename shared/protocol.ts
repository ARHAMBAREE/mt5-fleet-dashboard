/**
 * MT5 Fleet Agent ⇄ backend wire protocol.
 *
 * Transport:  POST JSON over HTTPS (MT5 WebRequest).
 * Auth:       after pairing, every request carries
 *               Authorization: Bearer m5a_<credential>
 *             The credential is generated once by the server and stored in
 *             the terminal's private MQL5 Files directory. The server keeps only a
 *             SHA-256 hash. No broker/trading/investor passwords are ever
 *             transmitted or stored.
 */

export const AGENT_API_VERSION = 1;

export const AGENT_ENDPOINTS = {
  register: "/api/agent/register",
  heartbeat: "/api/agent/heartbeat",
  snapshot: "/api/agent/snapshot",
  positions: "/api/agent/positions",
  orders: "/api/agent/orders",
} as const;

/** Pairing code format: ABC-123-XYZ (3 alnum, dash, 3 digits, dash, 3 alnum). */
export const PAIRING_CODE_REGEX = /^[A-Z0-9]{3}-\d{3}-[A-Z0-9]{3}$/;

export interface AgentRegisterRequest {
  v: number;
  pairingCode: string;
  installationId: string; // UUID generated once per installation (EA side)
  platform: string;       // "windows" | "macos" | "linux"
  terminalBuild: number;  // MQL5AccountInfoInteger? no — TERMINAL_BUILD
  terminalCompany: string;
  terminalName: string;
  eaVersion: string;
}

export interface AgentRegisterResponse {
  ok: true;
  agentId: string;
  credential: string;        // m5a_... — stored locally in the terminal
  heartbeatSeconds: number;
  snapshotSeconds: number;
}

export interface AgentHeartbeatRequest {
  v: number;
  accountLogin: string;
  server: string;
  broker: string;
  terminalConnected: boolean;
  algoTrading: boolean;
  eaLoaded: boolean;
  build: number;
}

export interface AgentHeartbeatResponse {
  ok: true;
  serverTime: number;
  heartbeatSeconds: number;
  snapshotSeconds: number;
  /** Server asks the agent to force a full resync (fresh pairing, gaps). */
  fullSync: boolean;
}

export interface AgentAccountInfo {
  todayRealizedPl?: number;
  realizedPlDay?: string; // YYYY-MM-DD, Pakistan time (UTC+5)
  monthlyRealizedPl?: number;
  monthlyPlMonth?: string; // YYYY-MM, Pakistan time (UTC+5)
  login: string;
  broker: string;
  server: string;
  currency: string;
  balance: number;
  equity: number;
  credit: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  leverage: number;
  mode: "LIVE" | "DEMO";
  tradeAllowed: boolean;
  algoTrading: boolean;
  terminalConnected: boolean;
}

export interface AgentSnapshotRequest {
  v: number;
  account: AgentAccountInfo;
}

export interface AgentSnapshotResponse {
  ok: true;
  serverTime: number;
  fullSync: boolean;
}

export interface AgentPositionDto {
  ticket: string | number;
  symbol: string;
  type: "BUY" | "SELL";
  volume: number;
  openPrice: number;
  currentPrice: number;
  sl: number;
  tp: number;
  swap: number;
  commission: number;
  profit: number;
  magic: string | number;
  comment: string;
  openTime: number; // epoch seconds
}

export interface AgentPositionsRequest {
  v: number;
  accountLogin: string;
  server: string;
  /** true = server treats the list as the complete set (prunes missing) */
  full: boolean;
  /** tickets closed/removed since the previous partial sync */
  removed?: (string | number)[];
  positions: AgentPositionDto[];
}

export interface AgentOrderDto {
  ticket: string | number;
  symbol: string;
  type: string; // ORDER_TYPE_* symbolic name
  volume: number;
  price: number;
  sl: number;
  tp: number;
  magic: string | number;
  comment: string;
  createTime: number; // epoch seconds
}

export interface AgentOrdersRequest {
  v: number;
  accountLogin: string;
  server: string;
  full: boolean;
  removed?: (string | number)[];
  orders: AgentOrderDto[];
}

export interface AgentOkResponse {
  ok: true;
  serverTime: number;
}

export interface AgentErrorResponse {
  ok: false;
  error: string;
  code:
    | "UNAUTHORIZED"
    | "INVALID_PAIRING_CODE"
    | "PAIRING_EXPIRED"
    | "AGENT_REVOKED"
    | "VALIDATION"
    | "RATE_LIMITED"
    | "NOT_FOUND"
    | "INTERNAL";
}
