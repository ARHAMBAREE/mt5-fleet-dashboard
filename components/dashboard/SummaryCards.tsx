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
  monthlyRealizedPl?: number | null;
  monthlyReportingAccounts?: number;
  monthlyTrackingSince?: string | null;
  totalDrawdownPct: number;
  openPositions: number;
}

/** Top summary strip: fleet KPIs exactly as specified. */
export default function SummaryCards({ totals, currency = "", goldTargets = [] }: { totals: Totals; currency?: string; goldTargets?: GoldTarget[] }) {
  currency = totals.currencies?.length === 1 ? totals.currencies[0] : currency;
  const cash = (value: number | null, signed = false) => value === null ? "Select currency" : (signed ? signedMoney : money)(value, currency);
  const quote = latestGoldQuote(goldTargets);
  const quoteStale = quote && (!quote.online || Date.now() - Date.parse(quote.updatedAt) > 60_000);
  const month = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit' });
  const partialMonth = totals.monthlyTrackingSince && month.format(new Date(totals.monthlyTrackingSince)) === month.format(new Date());
  const monthlyPeriod = partialMonth ? `Tracking since ${new Date(totals.monthlyTrackingSince!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'Since the 1st';
  const cards = [
    { label: "Total Accounts", value: String(totals.totalAccounts), cls: "accent" },
    { label: "Online", value: String(totals.online), cls: "good", sub: `${totals.warning} warning` },
    { label: "Offline", value: String(totals.offline), cls: totals.offline > 0 ? "bad" : "" },
    { label: "Total Balance", value: cash(totals.totalBalance), cls: "" },
    { label: "Total Equity", value: cash(totals.totalEquity), cls: "accent" },
    { label: "Total P/L · Today", value: totals.todayRealizedPl == null ? "Awaiting data" : cash(totals.todayRealizedPl, true), cls: "pnl-profit", sub: `Realized · Broker time · ${totals.realizedReportingAccounts ?? 0}/${totals.totalAccounts} reporting` },
    { label: "Floating P/L", value: cash(totals.floatingPl, true), cls: totals.floatingPl == null || totals.floatingPl === 0 ? "" : totals.floatingPl > 0 ? "pnl-profit" : "pnl-loss" },
    { label: "Total P/L · Month", value: totals.monthlyRealizedPl == null ? "Awaiting data" : cash(totals.monthlyRealizedPl, true), cls: (totals.monthlyRealizedPl ?? 0) < 0 ? "pnl-loss" : "pnl-profit", sub: `${monthlyPeriod} · Realized · ${totals.monthlyReportingAccounts ?? 0}/${totals.totalAccounts} reporting` },
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
