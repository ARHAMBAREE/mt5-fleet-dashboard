export type DetailRange = "24h" | "7d" | "30d" | "90d" | "1y";
export type DetailTab = "overview" | "equity" | "balance" | "positions" | "orders" | "risk" | "ea";

export interface AccountDetailPayload {
  account: {
    id: string; displayName: string | null; login: string; broker: string; server: string; currency: string; sourceCurrency: string; mode: string;
    balance: number; equity: number; credit: number; margin: number; freeMargin: number;
    marginLevel: number; leverage: number; tradeAllowed: boolean; algoTrading: boolean;
    terminalConnected: boolean; todayRealizedPl?: number | null; monthlyRealizedPl?: number | null;
    lastHeartbeatAt: string | null; snapshotAt: string | null;
    groups: { id: string; name: string; color: string }[];
    agent: { id: string; name: string; status: string; platform: string | null } | null;
  };
  eaStatus: {
    value: string; eaLoaded: boolean; terminalConnected: boolean; algoTrading: boolean;
    build: number | null; message: string | null; lastHeartbeatAt: string | null;
  };
  range: string;
  series: {
    equity: { t: string; v: number }[];
    balance: { t: string; v: number }[];
    drawdown: { t: string; v: number }[];
  };
  risk: Record<string, number>;
  positions: PositionRow[];
  orders: OrderRow[];
}

export interface PositionRow {
  id: string; ticket: string; symbol: string; type: string; volume: number; openPrice: number;
  currentPrice: number; sl: number; tp: number; profit: number; swap: number; commission: number;
  magic: string; comment: string; openTime: string;
}

export interface OrderRow {
  id: string; ticket: string; symbol: string; type: string; volume: number; price: number;
  sl: number; tp: number; magic: string; comment: string; createTime: string;
}

