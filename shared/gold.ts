export interface GoldTarget {
  id: string;
  accountId: string;
  login: string;
  server: string;
  symbol: string;
  ticket: string;
  magic: string;
  type: string;
  volume: number;
  currentPrice: number;
  tp: number;
  updatedAt: string;
  online: boolean;
}

/** Broker suffixes are allowed; other gold quote currencies stay separate. */
export function goldQuote(symbol: string): string | null {
  const code = symbol.toUpperCase();
  if (code.includes("XAUUSD") || code.startsWith("GOLD")) return "USD";
  return null;
}

export interface GoldGrid extends GoldTarget {
  positionCount: number;
  tpState: "shared" | "missing" | "mixed";
}

/** A grid is identified by account, exact broker symbol, EA magic and direction.
 * Do not average TP prices: mixed or missing stops do not define a basket exit.
 */
export function groupGoldGrids(positions: GoldTarget[]): GoldGrid[] {
  const groups = new Map<string, GoldTarget[]>();
  for (const p of positions) {
    const key = JSON.stringify([p.accountId, p.symbol, p.magic, p.type]);
    const rows = groups.get(key) ?? [];
    rows.push(p);
    groups.set(key, rows);
  }
  return [...groups.entries()].map(([id, rows]) => {
    const newest = rows.reduce((a, b) => a.updatedAt > b.updatedAt ? a : b);
    const prices = new Set(rows.map(p => p.tp));
    const tpState = prices.size === 1 && newest.tp > 0 ? "shared" : prices.size === 1 ? "missing" : "mixed";
    return {
      ...newest, id, positionCount: rows.length,
      volume: rows.reduce((sum, p) => sum + p.volume, 0),
      tp: tpState === "shared" ? newest.tp : 0, tpState,
      online: rows.every(p => p.online),
    };
  });
}

/** Latest valid terminal quote; no synthetic price when telemetry is unavailable. */
export function latestGoldQuote(positions: GoldTarget[]): GoldTarget | null {
  return positions.filter(p => goldQuote(p.symbol) === "USD" && Number.isFinite(p.currentPrice) && p.currentPrice > 0 && Number.isFinite(Date.parse(p.updatedAt)))
    .sort((a,b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id))[0] ?? null;
}
