"use client";
import { useState, useMemo } from "react";

import type { GoldTarget } from "@/shared/gold";
import SummaryCards from "@/components/dashboard/SummaryCards";
import AccountCards from "@/components/accounts/AccountCards";
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
    todayRealizedPl: number | null; realizedReportingAccounts: number;
    monthlyRealizedPl?: number | null; monthlyReportingAccounts?: number;
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
  const [botFilter, setBotFilter] = useState<"ALL" | "SAFE" | "AGGRESSIVE">("ALL");
  const accounts = useResource<AccountsPayload>(() => apiGet("/api/accounts", { currency, includeGold: "1" }), [currency]);
  const alerts = useResource<AlertsPayload>(() => apiGet("/api/alerts"), []);

  useLiveRefresh(() => {
    accounts.refetch();
    alerts.refetch();
  });

  const allRows = accounts.data?.rows ?? [];

  const counts = useMemo(() => ({
    all: allRows.length,
    safe: allRows.filter((r) => r.botType === "SAFE").length,
    aggressive: allRows.filter((r) => r.botType === "AGGRESSIVE").length,
  }), [allRows]);

  const displayedRows = useMemo(() => {
    if (botFilter === "SAFE") return allRows.filter((r) => r.botType === "SAFE");
    if (botFilter === "AGGRESSIVE") return allRows.filter((r) => r.botType === "AGGRESSIVE");
    return allRows;
  }, [allRows, botFilter]);

  const totals = useMemo(() => {
    if (botFilter === "ALL") {
      return accounts.data?.totals ?? {
        totalAccounts: 0, online: 0, warning: 0, offline: 0,
        totalBalance: 0, totalEquity: 0, floatingPl: 0, todayRealizedPl: null, realizedReportingAccounts: 0,
        totalDrawdownPct: 0, openPositions: 0,
      };
    }
    const currencies = [...new Set(displayedRows.map((r) => r.currency))];
    const mixed = currencies.length > 1;
    const reportingToday = displayedRows.filter((r) => r.todayRealizedPl !== null);
    const reportingMonthly = displayedRows.filter((r) => r.monthlyRealizedPl !== null && r.monthlyRealizedPl !== undefined);
    return {
      totalAccounts: displayedRows.length,
      online: displayedRows.filter((r) => r.eaStatus === "ONLINE").length,
      warning: displayedRows.filter((r) => r.eaStatus === "WARNING").length,
      offline: displayedRows.filter((r) => r.eaStatus === "OFFLINE").length,
      totalBalance: mixed ? null : displayedRows.reduce((s, r) => s + r.balance, 0),
      totalEquity: mixed ? null : displayedRows.reduce((s, r) => s + r.equity, 0),
      floatingPl: mixed ? null : displayedRows.reduce((s, r) => s + r.floatingPl, 0),
      todayRealizedPl: mixed || reportingToday.length === 0 ? null : reportingToday.reduce((s, r) => s + r.todayRealizedPl!, 0),
      realizedReportingAccounts: reportingToday.length,
      monthlyRealizedPl: mixed || reportingMonthly.length === 0 ? null : reportingMonthly.reduce((s, r) => s + (r.monthlyRealizedPl ?? 0), 0),
      monthlyReportingAccounts: reportingMonthly.length,
      totalDrawdownPct: displayedRows.reduce((s, r) => Math.max(s, r.drawdownPct), 0),
      openPositions: displayedRows.reduce((s, r) => s + r.openPositions, 0),
    };
  }, [accounts.data?.totals, displayedRows, botFilter]);

  const goldTargets = useMemo(() => {
    const allTargets = accounts.data?.goldTargets ?? [];
    if (botFilter === "ALL") return allTargets;
    const targetIds = new Set(displayedRows.map((r) => r.id));
    return allTargets.filter((g) => targetIds.has(g.accountId));
  }, [accounts.data?.goldTargets, displayedRows, botFilter]);

  return (
    <div className={totals.todayRealizedPl == null || totals.floatingPl == null ? "" : totals.todayRealizedPl > totals.floatingPl ? "pnl-above" : totals.todayRealizedPl < totals.floatingPl ? "pnl-below" : ""}>
      <div className="page-head">
        <div>
          <h2 className="dashboard-heading" style={{ marginBottom: 2 }}>
            {botFilter === "SAFE" ? "Safe Bot Overview" : botFilter === "AGGRESSIVE" ? "Aggressive Bot Overview" : "Portfolio overview"}
          </h2>
          <span className="small muted">
            {botFilter === "SAFE"
              ? "All accounts assigned to Safe Bot · isolated totals"
              : botFilter === "AGGRESSIVE"
              ? "All accounts assigned to Aggressive Bot · isolated totals"
              : "USD and USC accounts together · amounts shown as reported"}
          </span>
        </div>
        <span className="spacer" />
        <input aria-label="Currency filter" className="input" style={{maxWidth:170}} placeholder="Currency (e.g. USD)" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} />
        {accounts.loading && <span className="spinner" />}
      </div>

      {/* Bot Filter Tabs */}
      <div className="bot-tabs-bar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div className="bot-tabs" role="tablist" aria-label="Bot categories" style={{ display: "inline-flex", background: "#181524", border: "1px solid var(--border)", borderRadius: 14, padding: 4, gap: 4 }}>
          <button
            type="button"
            role="tab"
            aria-selected={botFilter === "ALL"}
            className={`bot-tab ${botFilter === "ALL" ? "active" : ""}`}
            onClick={() => setBotFilter("ALL")}
            style={{
              border: "none",
              borderRadius: 10,
              padding: "7px 14px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              background: botFilter === "ALL" ? "var(--panel)" : "transparent",
              color: botFilter === "ALL" ? "#fff" : "var(--muted)",
              boxShadow: botFilter === "ALL" ? "0 2px 8px rgba(0,0,0,0.3)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            <span>All Accounts</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: botFilter === "ALL" ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)", color: botFilter === "ALL" ? "#fff" : "var(--muted)" }}>
              {counts.all}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={botFilter === "SAFE"}
            className={`bot-tab safe ${botFilter === "SAFE" ? "active" : ""}`}
            onClick={() => setBotFilter("SAFE")}
            style={{
              border: botFilter === "SAFE" ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid transparent",
              borderRadius: 10,
              padding: "7px 14px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              background: botFilter === "SAFE" ? "rgba(16, 185, 129, 0.15)" : "transparent",
              color: botFilter === "SAFE" ? "#34d399" : "var(--muted)",
              boxShadow: botFilter === "SAFE" ? "0 2px 8px rgba(16, 185, 129, 0.2)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            <span>🛡️</span>
            <span>Safe Bot</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: botFilter === "SAFE" ? "rgba(16, 185, 129, 0.25)" : "rgba(255,255,255,0.06)", color: botFilter === "SAFE" ? "#6ee7b7" : "var(--muted)" }}>
              {counts.safe}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={botFilter === "AGGRESSIVE"}
            className={`bot-tab aggressive ${botFilter === "AGGRESSIVE" ? "active" : ""}`}
            onClick={() => setBotFilter("AGGRESSIVE")}
            style={{
              border: botFilter === "AGGRESSIVE" ? "1px solid rgba(249, 115, 22, 0.4)" : "1px solid transparent",
              borderRadius: 10,
              padding: "7px 14px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              background: botFilter === "AGGRESSIVE" ? "rgba(249, 115, 22, 0.15)" : "transparent",
              color: botFilter === "AGGRESSIVE" ? "#fb923c" : "var(--muted)",
              boxShadow: botFilter === "AGGRESSIVE" ? "0 2px 8px rgba(249, 115, 22, 0.2)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            <span>⚡</span>
            <span>Aggressive Bot</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: botFilter === "AGGRESSIVE" ? "rgba(249, 115, 22, 0.25)" : "rgba(255,255,255,0.06)", color: botFilter === "AGGRESSIVE" ? "#fdba74" : "var(--muted)" }}>
              {counts.aggressive}
            </span>
          </button>
        </div>

        <a
          href="/settings#bot-allocation"
          className="btn sm"
          style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, height: 32 }}
          title="Manage Bot Allocation in Settings"
        >
          <span>⚙️</span>
          <span>Sort Accounts in Settings</span>
        </a>
      </div>

      <SummaryCards totals={totals} goldTargets={goldTargets} />

      {displayedRows.length === 0 ? (
        <div className="card mb" style={{ padding: "36px 20px", textAlign: "center", background: "rgba(255, 255, 255, 0.02)", borderRadius: 14, border: "1px dashed var(--border)" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{botFilter === "SAFE" ? "🛡️" : "⚡"}</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
            {botFilter === "SAFE" ? "No accounts assigned to Safe Bot" : "No accounts assigned to Aggressive Bot"}
          </div>
          <p className="small muted" style={{ maxWidth: 460, margin: "0 auto 16px" }}>
            Assign your MT5 accounts to this bot category in Settings or directly tag them on the account cards.
          </p>
          <a href="/settings#bot-allocation" className="btn primary sm">
            ⚙️ Go to Settings to Sort Accounts
          </a>
        </div>
      ) : (
        <AccountCards rows={displayedRows} onUpdated={accounts.refetch} />
      )}

      <div className="grid cols-2">
        <div className="card">
          <div className="card-title">
            Recent Alerts
            <a href="/alerts" className="right small">View all →</a>
          </div>
          {((alerts.data?.events ?? []).filter((e) => e.type !== "DRAWDOWN_EXCEEDED")).length === 0 ? (
            <div className="empty" style={{ padding: 22 }}>
              <div className="big">✓</div>
              No alerts — everything within thresholds.
            </div>
          ) : (
            (alerts.data?.events ?? []).filter((e) => e.type !== "DRAWDOWN_EXCEEDED").slice(0, 8).map((e) => (
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
