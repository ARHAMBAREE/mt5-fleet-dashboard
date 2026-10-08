"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DataTable, { type Column } from "@/components/tables/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import { money, signedMoney, lastSeenLabel } from "@/lib/format";
import type { AccountSummary } from "@/shared/types";

/**
 * Fleet account table — sortable, filterable, column-customizable.
 * STATUS · ACCOUNT · BROKER · SERVER · BALANCE · EQUITY · FLOATING P/L ·
 * DRAWDOWN · MARGIN % · POSITIONS · EA STATUS · LAST SEEN
 */
export default function AccountsTable({ rows, storageKey = "fleet.accounts" }: { rows: AccountSummary[]; storageKey?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState("status");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = needle
      ? rows.filter((r) =>
          r.login.toLowerCase().includes(needle) ||
          r.broker.toLowerCase().includes(needle) ||
          r.server.toLowerCase().includes(needle)
        )
      : rows;

    const dir = sortDir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      switch (sortKey) {
        case "status": {
          const order = { ONLINE: 0, WARNING: 1, OFFLINE: 2 } as Record<string, number>;
          return dir * (order[a.eaStatus] - order[b.eaStatus]);
        }
        case "account": return dir * (Number(a.login) - Number(b.login) || a.login.localeCompare(b.login));
        case "lastSeen": {
          const av = a.lastHeartbeatAt ? Date.parse(a.lastHeartbeatAt) : 0;
          const bv = b.lastHeartbeatAt ? Date.parse(b.lastHeartbeatAt) : 0;
          return dir * (av - bv);
        }
        default: {
          const av = (a as unknown as Record<string, number | string>)[sortKey];
          const bv = (b as unknown as Record<string, number | string>)[sortKey];
          if (typeof av === "string" || typeof bv === "string") return dir * String(av ?? "").localeCompare(String(bv ?? ""));
          return dir * ((av as number) - (bv as number));
        }
      }
    });
  }, [rows, q, sortKey, sortDir]);

  const columns: Column<AccountSummary>[] = [
    { key: "status", label: "Status", value: (r) => ({ ONLINE: 0, WARNING: 1, OFFLINE: 2, DISABLED: 3 })[r.eaStatus] ?? 3, render: (r) => <StatusBadge status={r.eaStatus} /> },
    {
      key: "account", label: "Account", value: (r) => r.login,
      render: (r) => (
        <span>
          <span className="bold num">{r.login}</span>
          <span className="group-tag"> {r.mode}</span>
          <span className="group-tag">{r.sourceCurrency === "USC" ? "USC → USD" : r.sourceCurrency}</span>
          {r.groups.length > 0 && <span className="group-tag"> · {r.groups.map((g) => g.name).join(", ")}</span>}
        </span>
      ),
    },
    { key: "broker", label: "Broker", value: (r) => r.broker },
    { key: "server", label: "Server", value: (r) => r.server, hideable: true },
    { key: "balance", label: "Balance", align: "right", value: (r) => r.balance, render: (r) => <span className="num">{money(r.balance, r.currency)}</span> },
    { key: "equity", label: "Equity", align: "right", value: (r) => r.equity, render: (r) => <span className="num">{money(r.equity, r.currency)}</span> },
    { key: "floatingPl", label: "Floating P/L", align: "right", value: (r) => r.floatingPl,
      render: (r) => <span className={`num ${r.floatingPl >= 0 ? "pos" : "neg"}`}>{signedMoney(r.floatingPl, r.currency)}</span> },
    { key: "drawdownPct", label: "Drawdown", align: "right", value: (r) => r.drawdownPct,
      render: (r) => <span className={`num ${r.drawdownPct >= 10 ? "neg" : ""}`}>{r.drawdownPct.toFixed(2)}%</span> },
    { key: "marginLevel", label: "Margin %", align: "right", value: (r) => r.marginLevel,
      render: (r) => <span className={`num ${r.marginLevel > 0 && r.marginLevel < 100 ? "neg" : "muted"}`}>{r.marginLevel > 0 ? `${r.marginLevel.toFixed(0)}%` : "—"}</span> },
    { key: "openPositions", label: "Positions", align: "right", value: (r) => r.openPositions, render: (r) => <span className="num">{r.openPositions}</span> },
    { key: "ea", label: "EA Status", value: (r) => r.eaStatus,
      render: (r) => (<span className="small"><StatusBadge status={r.eaStatus} />{r.agentName && <span className="muted"> {r.agentName}</span>}</span>) },
    { key: "lastSeen", label: "Last Seen", align: "right", value: (r) => (r.lastHeartbeatAt ? Date.parse(r.lastHeartbeatAt) : 0),
      render: (r) => <span className="small muted num" title={r.lastHeartbeatAt ?? "never"}>{lastSeenLabel(r.lastHeartbeatAt)}</span> },
  ];

  return (
    <div>
      <div className="table-toolbar">
        <input className="input" style={{ maxWidth: 280 }} placeholder="Search login / broker / server…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="spacer" />
        <span className="pill-count">{filtered.length} accounts</span>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.id}
        storageKey={storageKey}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(k, d) => { setSortKey(k); setSortDir(d); }}
        onRowClick={(r) => router.push(`/accounts/${r.id}`)}
        empty={
          <div className="empty card">
            <div className="big">▤</div>
            <div className="bold">No accounts yet</div>
            <div className="small muted mt">
              Pair your first terminal: Settings → MT5 Agents → Add Agent, then enter the code in MT5FleetAgent.mq5
            </div>
          </div>
        }
      />
    </div>
  );
}
