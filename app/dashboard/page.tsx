"use client";
import { useState } from "react";

import GoldTargets from "@/components/dashboard/GoldTargets";
import type { GoldTarget } from "@/shared/gold";
import SummaryCards from "@/components/dashboard/SummaryCards";
import AccountsTable from "@/components/accounts/AccountsTable";
import { useResource } from "@/lib/client/useResource";
import { useLiveRefresh } from "@/lib/realtime/hooks";
import { apiGet } from "@/lib/client/api";
import type { AccountSummary } from "@/shared/types";
import { fmtDateTime } from "@/lib/format";

interface AccountsPayload {
  goldTargets?: GoldTarget[];
  rows: AccountSummary[];
  totals: {
    totalAccounts: number; online: number; warning: number; offline: number;
    totalBalance: number | null; totalEquity: number | null; floatingPl: number | null;
    totalDrawdownPct: number; openPositions: number;
  };
}

interface AlertsPayload {
  events: {
    id: string;
    type: string;
    severity: string;
    message: string;
    triggeredAt: string;
    acknowledgedAt: string | null;
    account?: { login: string } | null;
  }[];
  unacknowledged: number;
}

export default function DashboardPage() {
  const [currency, setCurrency] = useState("");
  const accounts = useResource<AccountsPayload>(() => apiGet("/api/accounts", { currency, includeGold: "1" }), [currency]);
  const alerts = useResource<AlertsPayload>(() => apiGet("/api/alerts"), []);

  useLiveRefresh(() => {
    accounts.refetch();
    alerts.refetch();
  });

  const totals = accounts.data?.totals ?? {
    totalAccounts: 0, online: 0, warning: 0, offline: 0,
    totalBalance: 0, totalEquity: 0, floatingPl: 0,
    totalDrawdownPct: 0, openPositions: 0,
  };

  return (
    <div>
      <div className="page-head">
        <h2>Fleet Overview</h2>
        <span className="small muted">USD and USC accounts together · amounts shown as reported</span>
        <input aria-label="Currency filter" className="input" style={{maxWidth:170}} placeholder="Currency (e.g. USD)" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} />
        <span className="spacer" />
        {accounts.loading && <span className="spinner" />}
      </div>

      <SummaryCards totals={totals} />
      <GoldTargets targets={accounts.data?.goldTargets ?? []} error={accounts.error} loading={accounts.loading} />

      <div className="card tight mb">
        <div style={{ padding: "14px 16px 0" }}>
          <div className="card-title">
            Accounts
            <span className="right muted small">Click a row for detail</span>
          </div>
        </div>
        <div style={{ padding: "0 16px 16px" }}>
          <AccountsTable rows={accounts.data?.rows ?? []} />
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="card-title">
            Recent Alerts
            <a href="/alerts" className="right small">View all →</a>
          </div>
          {(alerts.data?.events ?? []).length === 0 ? (
            <div className="empty" style={{ padding: 22 }}>
              <div className="big">✓</div>
              No alerts — everything within thresholds.
            </div>
          ) : (
            (alerts.data?.events ?? []).slice(0, 8).map((e) => (
              <div key={e.id} className="kv">
                <span className="k">
                  <span className={`badge ${e.severity === "CRITICAL" ? "offline" : e.severity === "WARNING" ? "warning" : "neutral"}`} style={{ marginRight: 8 }}>
                    {e.severity}
                  </span>
                  {e.message}
                </span>
                <span className="v muted small" style={{ whiteSpace: "nowrap" }}>{fmtDateTime(e.triggeredAt)}</span>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <div className="card-title">Quick Start</div>
          <div className="kv"><span className="k">1. Deploy backend</span><span className="v small muted">vercel --prod</span></div>
          <div className="kv"><span className="k">2. Pair an MT5 terminal</span><span className="v"><a href="/agents">Add Agent →</a></span></div>
          <div className="kv"><span className="k">3. Compile &amp; attach the EA</span><span className="v small muted">MT5FleetAgent.mq5</span></div>
          <div className="kv"><span className="k">4. Allow WebRequest</span><span className="v small muted">Tools → Options → EA</span></div>
          <div className="kv"><span className="k">5. Tune alert thresholds</span><span className="v"><a href="/alerts">Alerts →</a></span></div>
          <div className="kv"><span className="k">Desktop app</span><span className="v"><a href="/settings">Build installer →</a></span></div>
        </div>
      </div>
    </div>
  );
}
