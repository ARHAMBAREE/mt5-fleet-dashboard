"use client";

import { useState } from "react";
import AccountCards from "@/components/accounts/AccountCards";
import { useResource } from "@/lib/client/useResource";
import { useLiveRefresh } from "@/lib/realtime/hooks";
import { apiGet, apiDownload } from "@/lib/client/api";
import type { AccountSummary } from "@/shared/types";

interface AccountsPayload {
  rows: AccountSummary[];
  totals: Record<string, number>;
}

interface GroupsPayload {
  groups: { id: string; name: string; color: string; count: number }[];
  virtual: { id: string; name: string; color: string; count: number }[];
}

export default function AccountsPage() {
  const [groupId, setGroupId] = useState("ALL");
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState("");

  const groups = useResource<GroupsPayload>(() => apiGet("/api/groups"), []);
  const accounts = useResource<AccountsPayload>(
    () => apiGet("/api/accounts", { groupId, status, mode }),
    [groupId, status, mode]
  );

  useLiveRefresh(() => accounts.refetch());

  const chips = [
    { id: "ALL", name: "ALL", color: "#94a3b8", count: 0 },
    ...(groups.data?.groups ?? []),
  ];

  return (
    <div>
      <div className="page-head">
        <h2>Accounts</h2>
        <span className="spacer" />
        <select className="select" style={{ width: 130 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="ONLINE">Online</option>
          <option value="WARNING">Warning</option>
          <option value="OFFLINE">Offline</option>
        </select>
        <select className="select" style={{ width: 120 }} value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="">Live + Demo</option>
          <option value="LIVE">Live</option>
          <option value="DEMO">Demo</option>
        </select>
        <button className="btn sm" onClick={() => apiDownload("/api/export", { type: "accounts", format: "csv" })}>
          ⬇ CSV
        </button>
        <button className="btn sm" onClick={() => apiDownload("/api/export", { type: "accounts", format: "json" })}>
          ⬇ JSON
        </button>
      </div>

      <div className="chips mb">
        {chips.map((g) => (
          <button
            key={g.id}
            className={`chip ${groupId === g.id ? "active" : ""}`}
            onClick={() => setGroupId(g.id)}
          >
            <span className="swatch" style={{ background: g.color }} />
            {g.name}
            {g.id !== "ALL" && <span className="muted small">{g.count}</span>}
          </button>
        ))}
        <a href="/groups" className="chip">＋ Manage groups</a>
      </div>

      <div className="card tight">
        <div style={{ padding: "14px 16px" }}>
          <AccountCards rows={accounts.data?.rows ?? []} onUpdated={accounts.refetch} />
          {accounts.loading && !accounts.data && <div className="skeleton mt" style={{ height: 40 }} />}
        </div>
      </div>
    </div>
  );
}
