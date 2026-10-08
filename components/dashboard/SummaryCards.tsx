"use client";

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
  totalDrawdownPct: number;
  openPositions: number;
}

/** Top summary strip: fleet KPIs exactly as specified. */
export default function SummaryCards({ totals, currency = "" }: { totals: Totals; currency?: string }) {
  currency = totals.currencies?.length === 1 ? totals.currencies[0] : currency;
  const cash = (value: number | null, signed = false) => value === null ? "Select currency" : (signed ? signedMoney : money)(value, currency);
  const cards = [
    { label: "Total Accounts", value: String(totals.totalAccounts), cls: "accent" },
    { label: "Online", value: String(totals.online), cls: "good", sub: `${totals.warning} warning` },
    { label: "Offline", value: String(totals.offline), cls: totals.offline > 0 ? "bad" : "" },
    { label: "Total Balance", value: cash(totals.totalBalance), cls: "" },
    { label: "Total Equity", value: cash(totals.totalEquity), cls: "accent" },
    { label: "Total P/L", value: cash(totals.floatingPl, true), cls: (totals.floatingPl ?? 0) >= 0 ? "good" : "bad", sub: "Combined floating P/L" },
    { label: "Highest Drawdown", value: `${totals.totalDrawdownPct.toFixed(2)}%`, cls: totals.totalDrawdownPct > 10 ? "bad" : "" },
    { label: "Open Positions", value: String(totals.openPositions), cls: "accent" },
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
