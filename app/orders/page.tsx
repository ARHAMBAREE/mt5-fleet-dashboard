"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useResource } from "@/lib/client/useResource";
import { useLiveRefresh } from "@/lib/realtime/hooks";
import { apiGet, apiDownload } from "@/lib/client/api";
import DataTable, { type Column } from "@/components/tables/DataTable";
import { fmtDateTime } from "@/lib/format";
import type { AccountSummary } from "@/shared/types";

interface OrderItem {
  id: string; ticket: string; symbol: string; type: string; volume: number; price: number;
  sl: number; tp: number; magic: number; comment: string; createTime: string;
  account: { login: string; broker: string };
}

export default function OrdersPage() {
  const router = useRouter();
  const [accountId, setAccountId] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const accounts = useResource<{ rows: AccountSummary[] }>(() => apiGet("/api/accounts"), []);
  const orders = useResource<{ items: OrderItem[]; total: number }>(
    () => apiGet("/api/orders", { accountId, q, page, pageSize: 100 }),
    [accountId, q, page]
  );

  useLiveRefresh(() => orders.refetch());

  const columns: Column<OrderItem>[] = [
    { key: "account", label: "Account", value: (o) => o.account.login, render: (o) => <span className="num bold">{o.account.login}</span> },
    { key: "ticket", label: "Ticket", value: (o) => o.ticket, render: (o) => <span className="num">{o.ticket}</span> },
    { key: "symbol", label: "Symbol", value: (o) => o.symbol, render: (o) => <strong>{o.symbol}</strong> },
    { key: "type", label: "Type", value: (o) => o.type },
    { key: "volume", label: "Volume", align: "right", value: (o) => o.volume, render: (o) => <span className="num">{o.volume.toFixed(2)}</span> },
    { key: "price", label: "Price", align: "right", value: (o) => o.price, render: (o) => <span className="num">{o.price}</span> },
    { key: "sl", label: "SL", align: "right", value: (o) => o.sl, render: (o) => <span className="num muted">{o.sl || "—"}</span> },
    { key: "tp", label: "TP", align: "right", value: (o) => o.tp, render: (o) => <span className="num muted">{o.tp || "—"}</span> },
    { key: "magic", label: "Magic", align: "right", value: (o) => o.magic, hideable: true },
    { key: "comment", label: "Comment", value: (o) => o.comment, hideable: true, render: (o) => <span className="muted small">{o.comment || "—"}</span> },
    { key: "createTime", label: "Created", value: (o) => o.createTime, render: (o) => <span className="small muted">{fmtDateTime(o.createTime)}</span> },
  ];

  const total = orders.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 100));

  return (
    <div>
      <div className="page-head">
        <h2>Pending Orders</h2>
        <span className="spacer" />
        <button className="btn sm" onClick={() => apiDownload("/api/export", { type: "orders", format: "csv", accountId: accountId || undefined })}>⬇ CSV</button>
      </div>

      <div className="table-toolbar">
        <input className="input" style={{ maxWidth: 220 }} placeholder="Symbol / comment…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select className="select" style={{ maxWidth: 240 }} value={accountId} onChange={(e) => { setAccountId(e.target.value); setPage(1); }}>
          <option value="">All accounts</option>
          {(accounts.data?.rows ?? []).map((a) => (
            <option key={a.id} value={a.id}>{a.login} — {a.broker}</option>
          ))}
        </select>
        <span className="spacer" />
        <button className="btn sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
        <span className="pill-count">p. {page} / {pages}</span>
        <button className="btn sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
      </div>

      <DataTable
        columns={columns}
        rows={orders.data?.items ?? []}
        rowKey={(o) => o.id}
        storageKey="fleet.orders"
        minWidth={1000}
        onRowClick={(o) => {
          const acct = (accounts.data?.rows ?? []).find((a) => a.login === o.account.login);
          if (acct) router.push(`/accounts/${acct.id}`);
        }}
        empty={
          orders.loading ? (
            <div className="skeleton" style={{ height: 120 }} />
          ) : (
            <div className="empty card"><div className="big">≡</div>No pending orders.</div>
          )
        }
      />
    </div>
  );
}
