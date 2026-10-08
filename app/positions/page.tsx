"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useResource } from "@/lib/client/useResource";
import { useLiveRefresh } from "@/lib/realtime/hooks";
import { apiGet, apiDownload } from "@/lib/client/api";
import DataTable, { type Column } from "@/components/tables/DataTable";
import { money, signedMoney, fmtDateTime } from "@/lib/format";
import type { AccountSummary } from "@/shared/types";

interface PositionItem {
  id: string; ticket: string; symbol: string; type: string; volume: number;
  openPrice: number; currentPrice: number; sl: number; tp: number; swap: number;
  commission: number; profit: number; magic: number; comment: string; openTime: string;
  account: { login: string; broker: string; currency: string };
}

export default function PositionsPage() {
  const router = useRouter();
  const [accountId, setAccountId] = useState("");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const accounts = useResource<{ rows: AccountSummary[] }>(() => apiGet("/api/accounts"), []);
  const positions = useResource<{ items: PositionItem[]; total: number; floatingPl: number }>(
    () => apiGet("/api/positions", { accountId, type, q, page, pageSize: 100 }),
    [accountId, type, q, page]
  );

  useLiveRefresh(() => positions.refetch());

  const columns: Column<PositionItem>[] = [
    { key: "account", label: "Account", value: (p) => p.account.login, render: (p) => <span className="num bold">{p.account.login}</span> },
    { key: "ticket", label: "Ticket", value: (p) => p.ticket, render: (p) => <span className="num">{p.ticket}</span> },
    { key: "symbol", label: "Symbol", value: (p) => p.symbol, render: (p) => <strong>{p.symbol}</strong> },
    { key: "type", label: "Side", value: (p) => p.type, render: (p) => <span className={p.type === "BUY" ? "pos" : "neg"}>{p.type}</span> },
    { key: "volume", label: "Volume", align: "right", value: (p) => p.volume, render: (p) => <span className="num">{p.volume.toFixed(2)}</span> },
    { key: "openPrice", label: "Open", align: "right", value: (p) => p.openPrice, render: (p) => <span className="num">{p.openPrice}</span> },
    { key: "currentPrice", label: "Current", align: "right", value: (p) => p.currentPrice, render: (p) => <span className="num">{p.currentPrice}</span> },
    { key: "sl", label: "SL", align: "right", value: (p) => p.sl, render: (p) => <span className="num muted">{p.sl || "—"}</span> },
    { key: "tp", label: "TP", align: "right", value: (p) => p.tp, render: (p) => <span className="num muted">{p.tp || "—"}</span> },
    { key: "profit", label: "Profit", align: "right", value: (p) => p.profit, render: (p) => <span className={`num ${p.profit >= 0 ? "pos" : "neg"}`}>{signedMoney(p.profit)}</span> },
    { key: "swap", label: "Swap", align: "right", value: (p) => p.swap, hideable: true, render: (p) => <span className="num muted">{p.swap.toFixed(2)}</span> },
    { key: "commission", label: "Comm", align: "right", value: (p) => p.commission, hideable: true, render: (p) => <span className="num muted">{p.commission.toFixed(2)}</span> },
    { key: "magic", label: "Magic", align: "right", value: (p) => p.magic, hideable: true },
    { key: "openTime", label: "Open Time", value: (p) => p.openTime, render: (p) => <span className="small muted">{fmtDateTime(p.openTime)}</span> },
  ];

  const total = positions.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 100));

  return (
    <div>
      <div className="page-head">
        <h2>Open Positions</h2>
        <span className={`pill-count ${positions.data && positions.data.floatingPl >= 0 ? "pos" : "neg"}`}>
          Floating {signedMoney(positions.data?.floatingPl ?? 0)}
        </span>
        <span className="spacer" />
        <button className="btn sm" onClick={() => apiDownload("/api/export", { type: "positions", format: "csv", accountId: accountId || undefined })}>⬇ CSV</button>
      </div>

      <div className="table-toolbar">
        <input className="input" style={{ maxWidth: 220 }} placeholder="Symbol / comment…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select className="select" style={{ maxWidth: 240 }} value={accountId} onChange={(e) => { setAccountId(e.target.value); setPage(1); }}>
          <option value="">All accounts</option>
          {(accounts.data?.rows ?? []).map((a) => (
            <option key={a.id} value={a.id}>{a.login} — {a.broker}</option>
          ))}
        </select>
        <select className="select" style={{ width: 120 }} value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
          <option value="">Buy + Sell</option>
          <option value="BUY">Buy</option>
          <option value="SELL">Sell</option>
        </select>
        <span className="spacer" />
        <button className="btn sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
        <span className="pill-count">p. {page} / {pages}</span>
        <button className="btn sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
      </div>

      <DataTable
        columns={columns}
        rows={positions.data?.items ?? []}
        rowKey={(p) => p.id}
        storageKey="fleet.positions"
        minWidth={1200}
        onRowClick={(p) => {
          const acct = (accounts.data?.rows ?? []).find((a) => a.login === p.account.login);
          if (acct) router.push(`/accounts/${acct.id}`);
        }}
        empty={
          positions.loading ? (
            <div className="skeleton" style={{ height: 120 }} />
          ) : (
            <div className="empty card">
              <div className="big">⇄</div>
              No open positions match these filters.
            </div>
          )
        }
      />
    </div>
  );
}
