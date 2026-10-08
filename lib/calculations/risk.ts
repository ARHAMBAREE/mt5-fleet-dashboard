/**
 * Pure risk/portfolio math. No I/O — unit-testable and shared by API routes.
 */

export interface EquityPoint {
  at: Date | string | number;
  equity: number;
  balance: number;
}

export interface DrawdownResult {
  currentPct: number; // (peak - current) / peak * 100
  maxPct: number;     // worst drawdown across the series
  peak: number;       // equity peak
  trough: number;
}

const toMs = (t: Date | string | number): number =>
  t instanceof Date ? t.getTime() : typeof t === "string" ? Date.parse(t) : t;

/** Compute drawdown stats over an equity curve (chronological order). */
export function drawdown(equity: EquityPoint[]): DrawdownResult {
  if (equity.length === 0) return { currentPct: 0, maxPct: 0, peak: 0, trough: 0 };
  let peak = -Infinity;
  let maxPct = 0;
  let trough = 0;
  let last = equity[equity.length - 1].equity;
  for (const p of equity) {
    if (p.equity > peak) peak = p.equity;
    if (peak > 0) {
      const dd = ((peak - p.equity) / peak) * 100;
      if (dd > maxPct) {
        maxPct = dd;
        trough = p.equity;
      }
    }
    last = p.equity;
  }
  const currentPct = peak > 0 ? Math.max(0, ((peak - last) / peak) * 100) : 0;
  return { currentPct, maxPct, peak: peak === -Infinity ? 0 : peak, trough };
}

/** Percentage return between two values (0 when base is 0). */
export function pctReturn(from: number, to: number): number {
  if (!from) return 0;
  return ((to - from) / Math.abs(from)) * 100;
}

/** Sum of today's realized P/L from deals closed since `since`. */
export function sumRealized(deals: { profit: number; swap: number; commission: number }[]): number {
  return deals.reduce((acc, d) => acc + d.profit + d.swap + d.commission, 0);
}

export interface PositionAgg {
  floatingPl: number;
  longExposure: number;   // BUY volume in lots (not account-currency notional)
  shortExposure: number;
  openCount: number;
  totalExposure: number;
  maxPositionVolume: number;
}

export function aggregatePositions(
  positions: { type: string; volume: number; currentPrice: number; profit: number; swap?: number }[]
): PositionAgg {
  const agg: PositionAgg = {
    floatingPl: 0,
    longExposure: 0,
    shortExposure: 0,
    openCount: positions.length,
    totalExposure: 0,
    maxPositionVolume: 0,
  };
  for (const p of positions) {
    const notional = Math.abs(p.volume);
    if (p.type === "BUY") agg.longExposure += notional;
    else agg.shortExposure += notional;
    agg.floatingPl += p.profit + (p.swap ?? 0);
    agg.maxPositionVolume = Math.max(agg.maxPositionVolume, p.volume);
  }
  agg.totalExposure = agg.longExposure + agg.shortExposure;
  return agg;
}

export interface TradeStats {
  wins: number;
  losses: number;
  winRate: number;         // %
  profitFactor: number;    // gross profit / gross loss (∞ → capped)
  avgWin: number;
  avgLoss: number;
  totalTrades: number;
}

const PROFIT_FACTOR_CAP = 999.99;

/** Win rate / profit factor from closed-trade profits. */
export function tradeStats(profits: number[]): TradeStats {
  const wins = profits.filter((p) => p > 0);
  const losses = profits.filter((p) => p < 0);
  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  return {
    wins: wins.length,
    losses: losses.length,
    totalTrades: profits.length,
    winRate: profits.length ? (wins.length / profits.length) * 100 : 0,
    profitFactor: grossLoss > 0 ? Math.min(PROFIT_FACTOR_CAP, grossProfit / grossLoss) : grossProfit > 0 ? PROFIT_FACTOR_CAP : 0,
    avgWin: wins.length ? grossProfit / wins.length : 0,
    avgLoss: losses.length ? -grossLoss / losses.length : 0,
  };
}

export interface AccountRisk {
  drawdownPct: number;
  maxDrawdownPct: number;
  equityPeak: number;
  dailyPl: number;
  weeklyPl: number;
  monthlyPl: number;
  dailyReturnPct: number;
  weeklyReturnPct: number;
  monthlyReturnPct: number;
  marginUsagePct: number;
  floatingPl: number;
  longExposure: number;
  shortExposure: number;
  totalExposure: number;
}

/** Full risk report for one account given its series + deals. */
export function accountRisk(input: {
  equity: EquityPoint[];
  margin: number;
  positions: { type: string; volume: number; currentPrice: number; profit: number; swap?: number }[];
  dealsByPeriod: { day: number; week: number; month: number };
  openingBalance: { day: number; week: number; month: number };
}): AccountRisk {
  const dd = drawdown(input.equity);
  const pos = aggregatePositions(input.positions);
  const latestEquity = input.equity.length ? input.equity[input.equity.length - 1].equity : 0;
  const marginUsagePct = latestEquity > 0 ? (input.margin / latestEquity) * 100 : 0;

  return {
    drawdownPct: dd.currentPct,
    maxDrawdownPct: dd.maxPct,
    equityPeak: dd.peak,
    dailyPl: input.dealsByPeriod.day,
    weeklyPl: input.dealsByPeriod.week,
    monthlyPl: input.dealsByPeriod.month,
    dailyReturnPct: pctReturn(input.openingBalance.day, input.openingBalance.day + input.dealsByPeriod.day),
    weeklyReturnPct: pctReturn(input.openingBalance.week, input.openingBalance.week + input.dealsByPeriod.week),
    monthlyReturnPct: pctReturn(input.openingBalance.month, input.openingBalance.month + input.dealsByPeriod.month),
    marginUsagePct,
    floatingPl: pos.floatingPl,
    longExposure: pos.longExposure,
    shortExposure: pos.shortExposure,
    totalExposure: pos.totalExposure,
  };
}

/** Start of UTC day/week/month (week starts Monday). */
export function periodStarts(now = new Date()): { day: Date; week: Date; month: Date } {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (day.getUTCDay() + 6) % 7; // Monday = 0
  const week = new Date(day.getTime() - dow * 86_400_000);
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { day, week, month };
}
