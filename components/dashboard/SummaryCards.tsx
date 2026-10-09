"use client";

import { latestGoldQuote, type GoldTarget } from "@/shared/gold";
import { money, signedMoney, lastSeenLabel } from "@/lib/format";

interface Totals {
  currencies?: string[];
  totalAccounts: number;
  online: number;
  warning: number;
  offline: number;
  totalBalance: number | null;
  totalEquity: number | null;
  floatingPl: number | null;
  todayRealizedPl?: number | null;
  realizedReportingAccounts?: number;
  totalDrawdownPct: number;
  openPositions: number;
}

/** Top summary strip: fleet KPIs exactly as specified. */
export default function SummaryCards({ totals, currency = "", goldTargets = [] }: { totals: Totals; currency?: string; goldTargets?: GoldTarget[] }) {
  currency = totals.currencies?.length === 1 ? totals.currencies[0] : currency;
  const cash = (value: number | null, signed = false) => value === null ? "Select currency" : (signed ? signedMoney : money)(value, currency);
  const quote = latestGoldQuote(goldTargets);
  const quoteStale = quote && (!quote.online || Date.now() - Date.parse(quote.updatedAt) > 60_000);
  const cards = [
    { label: "Total Accounts", value: String(totals.totalAccounts), cls: "accent" },
    { label: "Online", value: String(totals.online), cls: "good", sub: `${totals.warning} warning` },
    { label: "Offline", value: String(totals.offline), cls: totals.offline > 0 ? "bad" : "" },
    { label: "Total Balance", value: cash(totals.totalBalance), cls: "" },
    { label: "Total Equity", value: cash(totals.totalEquity), cls: "accent" },
    { label: "Total P/L · Today", value: totals.todayRealizedPl == null ? "Awaiting data" : cash(totals.todayRealizedPl, true), cls: "pnl-profit", sub: `Realized · Pakistan time · ${totals.realizedReportingAccounts ?? 0}/${totals.totalAccounts} reporting` },
    { label: "Floating P/L", value: cash(totals.floatingPl, true), cls: totals.floatingPl == null || totals.floatingPl === 0 ? "" : totals.floatingPl > 0 ? "pnl-profit" : "pnl-loss" },
    { label: "Highest Drawdown", value: `${totals.totalDrawdownPct.toFixed(2)}%`, cls: totals.totalDrawdownPct > 10 ? "bad" : "" },
    { label: "Open Positions", value: String(totals.openPositions), cls: "accent" },
    { label: "Gold Price", value: quote ? money(quote.currentPrice, "USD") : "Awaiting quote", cls: "gold-price", sub: quote ? `${quote.symbol} · ${quoteStale ? "Stale · " : ""}${lastSeenLabel(quote.updatedAt)}` : "From MT5 gold positions" },
  ];

  return (
    <div className="stats">
      {cards.map((c) => (
        <div key={c.label} className={`stat ${c.cls}`}>
          <div className="label">{c.label}</div>
          <div className="value">{c.value}</div>
          {c.sub && <div className="sub">{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export function LastSeen({ at }: { at: string | null }) {
  return (
    <span className="small muted num" title={at ?? "never"}>
      {lastSeenLabel(at)}
    </span>
  );
}
