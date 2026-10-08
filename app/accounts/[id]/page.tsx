"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useResource } from "@/lib/client/useResource";
import { useLiveRefresh } from "@/lib/realtime/hooks";
import { apiGet, apiDownload } from "@/lib/client/api";
import LineChart from "@/components/charts/LineChart";
import StatusBadge from "@/components/ui/StatusBadge";
import DataTable, { type Column } from "@/components/tables/DataTable";
import { money, signedMoney, fmtDateTime, pct } from "@/lib/format";
import type { AccountDetailPayload, DetailRange, DetailTab, PositionRow, OrderRow } from "@/components/accounts/detailTypes";

const TABS: { id: DetailTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "equity", label: "Equity" },
  { id: "balance", label: "Balance" },
  { id: "drawdown", label: "Drawdown" },
  { id: "positions", label: "Positions" },
  { id: "orders", label: "Orders" },
  { id: "risk", label: "Risk" },
  { id: "ea", label: "EA Status" },
];

export default function AccountDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [range, setRange] = useState<DetailRange>("30d");
  const [tab, setTab] = useState<DetailTab>("overview");

  const detail = useResource<AccountDetailPayload>(() => apiGet(`/api/accounts/${id}`, { range }), [id, range]);
  const d = detail.data;
  useLiveRefresh(() => detail.refetch());

  const moneyFmt = (v: number) => money(v, d?.account.currency ?? "");
  const kv = (k: string, v: React.ReactNode) => (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );

  if (detail.loading && !d) {
    return (
      <div>
        <div className="skeleton" style={{ width: 260, height: 26 }} />
        <div className="skeleton mt" style={{ height: 220 }} />
      </div>
    );
  }
  if (!d) {
    return (
      <div className="empty card">
        <div className="big">?</div>
        Account not found. <Link href="/accounts">← Back to accounts</Link>
      </div>
    );
  }

  const r = d.risk;

  const positionColumns: Column<PositionRow>[] = [
    { key: "ticket", label: "Ticket", value: (p) => p.ticket, render: (p) => <span className="num">{p.ticket}</span> },
    { key: "symbol", label: "Symbol", value: (p) => p.symbol, render: (p) => <strong>{p.symbol}</strong> },
    { key: "type", label: "Side", value: (p) => p.type, render: (p) => <span className={p.type === "BUY" ? "pos" : "neg"}>{p.type}</span> },
    { key: "volume", label: "Volume", align: "right", value: (p) => p.volume, render: (p) => <span className="num">{p.volume.toFixed(2)}</span> },
    { key: "openPrice", label: "Open", align: "right", value: (p) => p.openPrice, render: (p) => <span className="num">{p.openPrice}</span> },
    { key: "currentPrice", label: "Current", align: "right", value: (p) => p.currentPrice, render: (p) => <span className="num">{p.currentPrice}</span> },
    { key: "sl", label: "SL", align: "right", value: (p) => p.sl, render: (p) => <span className="num muted">{p.sl || "—"}</span> },
    { key: "tp", label: "TP", align: "right", value: (p) => p.tp, render: (p) => <span className="num muted">{p.tp || "—"}</span> },
    { key: "profit", label: "Profit", align: "right", value: (p) => p.profit, render: (p) => <span className={`num ${p.profit >= 0 ? "pos" : "neg"}`}>{signedMoney(p.profit)}</span> },
    { key: "swap", label: "Swap", align: "right", value: (p) => p.swap, render: (p) => <span className="num muted">{p.swap.toFixed(2)}</span> },
    { key: "magic", label: "Magic", align: "right", value: (p) => p.magic, hideable: true },
    { key: "openTime", label: "Open Time", value: (p) => p.openTime, render: (p) => <span className="small muted">{fmtDateTime(p.openTime)}</span> },
  ];

  return (
    <div>
      <div className="page-head">
        <Link href="/accounts" className="btn sm">← Accounts</Link>
        <h2 className="num">{d.account.login}</h2>
        <StatusBadge status={d.eaStatus.value} />
        <span className={`badge ${d.account.mode === "LIVE" ? "live" : "demo"}`}>{d.account.mode}</span>
        <span className="muted small hide-mobile">{d.account.broker} · {d.account.server}</span>
        <span className="spacer" />
        <select className="select" style={{ width: 110 }} value={range} onChange={(e) => setRange(e.target.value as DetailRange)}>
          <option value="24h">24 hours</option>
          <option value="7d">7 days</option>
          <option value="30d">30 days</option>
          <option value="90d">90 days</option>
          <option value="1y">1 year</option>
        </select>
        <button className="btn sm" onClick={() => apiDownload("/api/export", { type: "positions", format: "csv", accountId: id })}>⬇ Positions</button>
      </div>

      <div className="stats">
        <div className="stat accent"><div className="label">Equity</div><div className="value">{moneyFmt(d.account.equity)}</div></div>
        <div className="stat"><div className="label">Balance</div><div className="value">{moneyFmt(d.account.balance)}</div></div>
        <div className={`stat ${r.floatingPl >= 0 ? "good" : "bad"}`}><div className="label">Floating P/L</div><div className="value">{signedMoney(r.floatingPl)}</div></div>
        <div className="stat"><div className="label">Drawdown</div><div className="value">{pct(r.drawdownPct)}</div><div className="sub">max {pct(r.maxDrawdownPct)}</div></div>
        <div className="stat"><div className="label">Open Positions</div><div className="value">{r.openCount}</div></div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid cols-2">
          <div className="card">
            <div className="card-title">Account</div>
            {kv("Login", <span className="num">{d.account.login}</span>)}
            {kv("Broker", d.account.broker)}
            {kv("Server", d.account.server)}
            {kv("Display currency", d.account.currency)}
            {kv("Account currency", d.account.sourceCurrency)}
            {kv("Mode", d.account.mode)}
            {kv("Leverage", `1:${d.account.leverage}`)}
            {kv("Credit", moneyFmt(d.account.credit))}
            {kv("Groups", d.account.groups.length ? d.account.groups.map((g) => g.name).join(", ") : "—")}
            {kv("Last heartbeat", d.account.lastHeartbeatAt ? fmtDateTime(d.account.lastHeartbeatAt) : "never")}
            {kv("Last snapshot", d.account.snapshotAt ? fmtDateTime(d.account.snapshotAt) : "—")}
          </div>
          <div className="card">
            <div className="card-title">Funds &amp; Margin</div>
            {kv("Balance", moneyFmt(d.account.balance))}
            {kv("Equity", moneyFmt(d.account.equity))}
            {kv("Margin", moneyFmt(d.account.margin))}
            {kv("Free margin", moneyFmt(d.account.freeMargin))}
            {kv("Margin level", d.account.marginLevel > 0 ? pct(d.account.marginLevel, 0) : "—")}
            {kv("Trading allowed", d.account.tradeAllowed ? <span className="pos">YES</span> : <span className="neg">NO</span>)}
            {kv("Algo trading", d.account.algoTrading ? <span className="pos">ENABLED</span> : <span className="neg">DISABLED</span>)}
            {kv("Terminal connected", d.account.terminalConnected ? <span className="pos">YES</span> : <span className="neg">NO</span>)}
            {kv("Agent", d.account.agent ? `${d.account.agent.name} (${d.account.agent.status})` : "unpaired")}
          </div>
        </div>
      )}

      {(tab === "equity" || tab === "balance") && (
        <div className="card">
          <div className="card-title">{tab === "equity" ? "Equity Curve" : "Balance Curve"}</div>
          <LineChart
            height={300}
            series={
              tab === "equity"
                ? [
                    { name: "Equity", color: "#3b82f6", points: d.series.equity },
                    { name: "Balance", color: "#a855f7", points: d.series.balance, fill: false },
                  ]
                : [{ name: "Balance", color: "#a855f7", points: d.series.balance }]
            }
            formatV={(v) => money(v)}
          />
        </div>
      )}

      {tab === "drawdown" && (
        <div className="grid cols-2">
          <div className="card">
            <div className="card-title">Drawdown %</div>
            <LineChart height={260} zeroLine series={[{ name: "Drawdown", color: "#ef4444", points: d.series.drawdown }]} formatV={(v) => `${v.toFixed(2)}%`} />
          </div>
        </div>
      )}

      {tab === "positions" && (
        <DataTable
          columns={positionColumns}
          rows={d.positions}
          rowKey={(p) => p.id}
          storageKey={`pos.${id}`}
          minWidth={980}
          empty={<div className="empty card"><div className="big">⇄</div>No open positions.</div>}
        />
      )}

      {tab === "orders" && (
        <DataTable
          columns={[
            { key: "ticket", label: "Ticket", value: (o: OrderRow) => o.ticket, render: (o: OrderRow) => <span className="num">{o.ticket}</span> },
            { key: "symbol", label: "Symbol", value: (o: OrderRow) => o.symbol, render: (o: OrderRow) => <strong>{o.symbol}</strong> },
            { key: "type", label: "Type", value: (o: OrderRow) => o.type },
            { key: "volume", label: "Volume", align: "right", value: (o: OrderRow) => o.volume, render: (o: OrderRow) => <span className="num">{o.volume.toFixed(2)}</span> },
            { key: "price", label: "Price", align: "right", value: (o: OrderRow) => o.price, render: (o: OrderRow) => <span className="num">{o.price}</span> },
            { key: "sl", label: "SL", align: "right", value: (o: OrderRow) => o.sl, render: (o: OrderRow) => <span className="num muted">{o.sl || "—"}</span> },
            { key: "tp", label: "TP", align: "right", value: (o: OrderRow) => o.tp, render: (o: OrderRow) => <span className="num muted">{o.tp || "—"}</span> },
            { key: "magic", label: "Magic", align: "right", value: (o: OrderRow) => o.magic, hideable: true },
            { key: "comment", label: "Comment", value: (o: OrderRow) => o.comment, hideable: true, render: (o: OrderRow) => <span className="muted small">{o.comment || "—"}</span> },
            { key: "createTime", label: "Created", value: (o: OrderRow) => o.createTime, render: (o: OrderRow) => <span className="small muted">{fmtDateTime(o.createTime)}</span> },
          ]}
          rows={d.orders}
          rowKey={(o) => o.id}
          storageKey={`ord.${id}`}
          minWidth={900}
          empty={<div className="empty card"><div className="big">≡</div>No pending orders.</div>}
        />
      )}

      {tab === "risk" && (
        <div className="grid cols-3">
          <div className="card">
            <div className="card-title">Drawdown</div>
            {kv("Current drawdown", pct(r.drawdownPct))}
            {kv("Maximum drawdown", pct(r.maxDrawdownPct))}
            {kv("Equity peak", moneyFmt(r.equityPeak))}
          </div>
          <div className="card">
            <div className="card-title">P/L &amp; Margin</div>
            {kv("Margin usage", pct(r.marginUsagePct))}
            {kv("Floating P/L", <span className={r.floatingPl >= 0 ? "pos" : "neg"}>{signedMoney(r.floatingPl)}</span>)}
          </div>
          <div className="card">
            <div className="card-title">Exposure</div>
            {kv("Total exposure", `${r.totalExposure.toFixed(2)} lots`)}
            {kv("Long exposure", <span className="pos">{`${r.longExposure.toFixed(2)} lots`}</span>)}
            {kv("Short exposure", <span className="neg">{`${r.shortExposure.toFixed(2)} lots`}</span>)}
          </div>
        </div>
      )}

      {tab === "ea" && (
        <div className="grid cols-2">
          <div className="card">
            <div className="card-title">Agent Health</div>
            {kv("EA status", <StatusBadge status={d.eaStatus.value} />)}
            {kv("EA loaded", d.eaStatus.eaLoaded ? <span className="pos">YES</span> : <span className="neg">NO</span>)}
            {kv("Terminal connected", d.eaStatus.terminalConnected ? <span className="pos">YES</span> : <span className="neg">NO</span>)}
            {kv("Algo trading", d.eaStatus.algoTrading ? <span className="pos">ENABLED</span> : <span className="neg">DISABLED</span>)}
            {kv("Terminal build", d.eaStatus.build ?? "—")}
            {kv("Last heartbeat", d.eaStatus.lastHeartbeatAt ? fmtDateTime(d.eaStatus.lastHeartbeatAt) : "never")}
            {kv("Message", d.eaStatus.message ?? "—")}
          </div>
          <div className="card">
            <div className="card-title">Paired Agent</div>
            {d.account.agent ? (
              <>
                {kv("Name", d.account.agent.name)}
                {kv("Status", d.account.agent.status)}
                {kv("Platform", d.account.agent.platform ?? "—")}
                {kv("Agent ID", <span className="mono small">{d.account.agent.id}</span>)}
                <div className="mt"><Link className="btn sm" href="/agents">Manage agents →</Link></div>
              </>
            ) : (
              <div className="empty" style={{ padding: 20 }}>
                <div className="big">⚑</div>
                This account shows OFFLINE because no agent is paired.
                <div className="mt"><Link className="btn primary sm" href="/agents">Pair an agent</Link></div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}



