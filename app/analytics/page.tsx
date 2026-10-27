"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useResource } from "@/lib/client/useResource";
import { useLiveRefresh } from "@/lib/realtime/hooks";
import { apiGet, apiDownload } from "@/lib/client/api";
import LineChart from "@/components/charts/LineChart";
import StatusBadge from "@/components/ui/StatusBadge";
import { money, signedMoney, pct } from "@/lib/format";

interface AnalyticsPayload {
  currencies: string[];
  totals: {
    totalAccounts: number; online: number; warning: number; offline: number;
    combinedEquity: number | null; combinedBalance: number | null; combinedFloatingPl: number | null;
    combinedDrawdownPct: number; maxDrawdownPct: number;
    openPositions: number;
  };
  series: { t: string; equity: number; balance: number }[];
  ranking: {
    currency: string; accountId: string; login: string; broker: string; status: string; mode: string;
    equity: number; balance: number; floatingPl: number;
    drawdownPct: number; maxDrawdownPct: number; openPositions: number;
  }[];
  best: { login: string; floatingPl: number } | null;
  worst: { login: string; floatingPl: number } | null;
  highestDrawdown: { login: string; drawdownPct: number } | null;
}

interface GroupsPayload {
  groups: { id: string; name: string; color: string }[];
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [range, setRange] = useState<"24h" | "7d" | "30d" | "90d" | "1y">("30d");
  const [groupId, setGroupId] = useState("");
  const [mode, setMode] = useState("");
  const [broker, setBroker] = useState("");
  const [currency, setCurrency] = useState("");
  const [server, setServer] = useState("");
  const [agentId, setAgentId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [symbol, setSymbol] = useState("");
  const agents = useResource<{agents: {id: string; name: string}[]}>(() => apiGet("/api/agents"), []);
  const accounts = useResource<{rows: {id: string; login: string}[]}>(() => apiGet("/api/accounts"), []);

  const groups = useResource<GroupsPayload>(() => apiGet("/api/groups"), []);
  const analytics = useResource<AnalyticsPayload>(
    () => apiGet("/api/analytics", { range, groupId, mode, broker, currency, server, agentId, accountId, symbol }),
    [range, groupId, mode, broker, currency, server, agentId, accountId, symbol]
  );

  useLiveRefresh(() => analytics.refetch());

  const t = analytics.data?.totals;
  const brokers = [...new Set((analytics.data?.ranking ?? []).map((r) => r.broker))];

  return (
    <div>
      <div className="page-head">
        <h2>Multi-Account Analytics</h2>
        <span className="spacer" />
        <select className="select" style={{ width: 110 }} value={range} onChange={(e) => setRange(e.target.value as typeof range)}>
          <option value="24h">24 hours</option>
          <option value="7d">7 days</option>
          <option value="30d">30 days</option>
          <option value="90d">90 days</option>
          <option value="1y">1 year</option>
        </select>
        <select className="select" style={{ width: 140 }} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="">All groups</option>
          {(groups.data?.groups ?? []).map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <select className="select" style={{ width: 120 }} value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="">Live + Demo</option>
          <option value="LIVE">Live</option>
          <option value="DEMO">Demo</option>
        </select>
        <select className="select" style={{ width: 150 }} value={broker} onChange={(e) => setBroker(e.target.value)}>
          <option value="">All brokers</option>
          {brokers.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <button className="btn sm" onClick={() => apiDownload("/api/export", { type: "analytics", format: "csv" })}>⬇ CSV</button>
      </div>

      <div className="flex mb" style={{flexWrap:"wrap", gap:8}}>
        <input className="input" style={{maxWidth:160}} aria-label="Currency" placeholder="Currency (e.g. USD)" value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())}/>
        <input className="input" style={{maxWidth:160}} aria-label="Server" placeholder="Server" value={server} onChange={e=>setServer(e.target.value)}/>
        <input className="input" style={{maxWidth:160}} aria-label="Symbol" placeholder="Open symbol" value={symbol} onChange={e=>setSymbol(e.target.value)}/>
        <select className="select" style={{maxWidth:180}} aria-label="Agent" value={agentId} onChange={e=>setAgentId(e.target.value)}><option value="">All agents</option>{agents.data?.agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>
        <select className="select" style={{maxWidth:180}} aria-label="Account" value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">All accounts</option>{accounts.data?.rows.map(a=><option key={a.id} value={a.id}>{a.login}</option>)}</select>
      </div>
      {analytics.error && <div className="form-error">{analytics.error}</div>}
      {(analytics.data?.currencies.length ?? 0) > 1 && <p className="muted">Choose a currency to combine balances, P/L and equity. USC is shown in USD (USC amounts kept unchanged); other currencies are kept separate.</p>}
      <div className="stats">
        <div className="stat accent"><div className="label">Combined Equity</div><div className="value">{t?.combinedEquity === null ? "—" : money(t?.combinedEquity ?? 0, analytics.data?.currencies[0] ?? "USD")}</div></div>
        <div className="stat"><div className="label">Combined Balance</div><div className="value">{t?.combinedBalance === null ? "—" : money(t?.combinedBalance ?? 0, analytics.data?.currencies[0] ?? "USD")}</div></div>
        <div className={`stat ${(t?.combinedFloatingPl ?? 0) >= 0 ? "good" : "bad"}`}><div className="label">Combined Floating P/L</div><div className="value">{t?.combinedFloatingPl === null ? "—" : signedMoney(t?.combinedFloatingPl ?? 0, analytics.data?.currencies[0] ?? "USD")}</div></div>
        <div className="stat accent"><div className="label">Accounts / Positions</div><div className="value">{t?.totalAccounts ?? 0} / {t?.openPositions ?? 0}</div><div className="sub">{t?.online ?? 0} online · {t?.offline ?? 0} offline</div></div>
      </div>

      <div className="grid cols-2 mb">
        <div className="card">
          <div className="card-title">Combined Equity Curve</div>
          <LineChart
            height={260}
            series={[
              { name: "Equity", color: "#3b82f6", points: (analytics.data?.series ?? []).map((p) => ({ t: p.t, v: p.equity })) },
              { name: "Balance", color: "#a855f7", points: (analytics.data?.series ?? []).map((p) => ({ t: p.t, v: p.balance })), fill: false },
            ]}
            formatV={(v) => money(v)}
          />
        </div>
        <div className="card">
          <div className="card-title">Leaders &amp; Laggards</div>
          <div className="kv"><span className="k">Best performer (floating P/L)</span><span className="v">{analytics.data?.best ? `${analytics.data.best.login} · ${signedMoney(analytics.data.best.floatingPl)}` : "—"}</span></div>
          <div className="kv"><span className="k">Worst performer (floating P/L)</span><span className="v">{analytics.data?.worst ? `${analytics.data.worst.login} · ${signedMoney(analytics.data.worst.floatingPl)}` : "—"}</span></div>
          <div className="kv"><span className="k">Accounts ranked</span><span className="v">{analytics.data?.ranking.length ?? 0}</span></div>
          <div className="small muted mt">Ranking by current floating P/L. Filters above apply to every figure on this page.</div>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th>#</th><th>Account</th><th>Broker</th><th>Status</th>
              <th className="right">Equity</th><th className="right">Balance</th>
              <th className="right">Floating P/L</th>
              <th className="right">Positions</th>
            </tr>
          </thead>
          <tbody>
            {(analytics.data?.ranking ?? []).map((r, i) => (
              <tr key={r.accountId} className="clickable" onClick={() => router.push(`/accounts/${r.accountId}`)}>
                <td className="muted">{i + 1}</td>
                <td className="num bold">{r.login} <span className="group-tag">{r.mode}</span></td>
                <td>{r.broker}</td>
                <td><StatusBadge status={r.status} /></td>
                <td className="right num">{money(r.equity, r.currency)}</td>
                <td className="right num">{money(r.balance, r.currency)}</td>
                <td className={`right num ${r.floatingPl >= 0 ? "pos" : "neg"}`}>{signedMoney(r.floatingPl, r.currency)}</td>
                <td className="right num">{r.openPositions}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!analytics.loading && (analytics.data?.ranking.length ?? 0) === 0 && (
          <div className="empty"><div className="big">∿</div>No data for these filters.</div>
        )}
      </div>

    </div>
  );
}
