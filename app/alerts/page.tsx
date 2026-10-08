"use client";

import { useState } from "react";
import { useResource } from "@/lib/client/useResource";
import { useLiveRefresh } from "@/lib/realtime/hooks";
import { apiGet, apiSend, ApiClientError } from "@/lib/client/api";
import { fmtDateTime, money } from "@/lib/format";
import { TYPE_LABELS } from "@/components/alerts/typeLabels";

interface AlertRule {
  id: string; name: string; type: string; enabled: boolean; threshold: number;
  cooldownSeconds: number; severity: string; accountId: string | null;
  account?: { login: string; broker: string } | null;
}

interface AlertEvent {
  id: string; type: string; severity: string; value: number; threshold: number;
  message: string; triggeredAt: string; acknowledgedAt: string | null;
}

interface Payload {
  alerts: AlertRule[];
  events: AlertEvent[];
  unacknowledged: number;
}

export default function AlertsPage() {
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({ type: "DRAWDOWN_EXCEEDED", threshold: 10, name: "", severity: "WARNING" });
  const [edits, setEdits] = useState<Record<string, string>>({});

  const alerts = useResource<Payload>(() => apiGet("/api/alerts"), []);
  useLiveRefresh(() => alerts.refetch(), ["alerts:new", "__resync__"]);

  async function toggle(rule: AlertRule) {
    try {
      await apiSend("PUT", "/api/alerts", {
        id: rule.id, name: rule.name, type: rule.type, enabled: !rule.enabled,
        threshold: rule.threshold, accountId: rule.accountId,
        cooldownSeconds: rule.cooldownSeconds, severity: rule.severity,
      });
      alerts.refetch();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Update failed");
    }
  }

  async function saveThreshold(rule: AlertRule, raw: string) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value === rule.threshold) return;
    try {
      await apiSend("PUT", "/api/alerts", {
        id: rule.id, name: rule.name, type: rule.type, enabled: rule.enabled,
        threshold: value, accountId: rule.accountId, cooldownSeconds: rule.cooldownSeconds, severity: rule.severity,
      });
      alerts.refetch();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Update failed");
    }
  }

  async function createAlert(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await apiSend("POST", "/api/alerts", {
        name: draft.name || undefined,
        type: draft.type,
        threshold: Number(draft.threshold),
        enabled: true,
        cooldownSeconds: 300,
        severity: draft.severity,
      });
      setShowCreate(false);
      setDraft({ type: "DRAWDOWN_EXCEEDED", threshold: 10, name: "", severity: "WARNING" });
      alerts.refetch();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Create failed");
    }
  }

  async function ack(id?: string) {
    try {
      await apiSend("POST", "/api/alerts/events", id ? { id } : { all: true });
      alerts.refetch();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Acknowledge failed");
    }
  }

  return (
    <div>
      <div className="page-head">
        <h2>Alerts</h2>
        <span className="pill-count">{alerts.data?.unacknowledged ?? 0} unacknowledged</span>
        <span className="spacer" />
        <button className="btn sm" onClick={() => ack()}>✓ Acknowledge all</button>
        <button className="btn primary sm" onClick={() => setShowCreate(true)}>＋ New rule</button>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="grid cols-2">
        <div className="card">
          <div className="card-title">Rules &amp; Thresholds</div>
          <div className="table-wrap" style={{ border: "none" }}>
            <table className="data" style={{ minWidth: 460 }}>
              <thead>
                <tr><th>On</th><th>Rule</th><th className="right">Threshold</th><th className="right">Cooldown</th></tr>
              </thead>
              <tbody>
                {(alerts.data?.alerts ?? []).map((rule) => (
                  <tr key={rule.id}>
                    <td><input type="checkbox" checked={rule.enabled} onChange={() => toggle(rule)} aria-label={`Toggle ${rule.name}`} /></td>
                    <td>
                      <div className="bold">{TYPE_LABELS[rule.type] ?? rule.type}</div>
                      <div className="small muted">
                        {rule.severity}
                        {rule.account ? ` · account ${rule.account.login}` : " · all accounts"}
                      </div>
                    </td>
                    <td className="right">
                      <input
                        className="input num"
                        style={{ width: 110, textAlign: "right", padding: "6px 8px" }}
                        type="number"
                        min={0}
                        value={edits[rule.id] ?? rule.threshold}
                        onChange={(e) => setEdits((s) => ({ ...s, [rule.id]: e.target.value }))}
                        onBlur={(e) => { saveThreshold(rule, e.target.value); setEdits((s) => { const n = { ...s }; delete n[rule.id]; return n; }); }}
                      />
                    </td>
                    <td className="right muted small">{Math.round(rule.cooldownSeconds / 60)}m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="small muted mt">Offline rules fire once per outage. Threshold rules respect per-rule cooldowns.</div>
        </div>

        <div className="card">
          <div className="card-title">Event Feed</div>
          {(alerts.data?.events ?? []).length === 0 ? (
            <div className="empty" style={{ padding: 24 }}>
              <div className="big">✓</div>
              No alert events yet.
            </div>
          ) : (
            (alerts.data?.events ?? []).map((e) => (
              <div key={e.id} className="kv" style={{ alignItems: "center" }}>
                <span className="k" style={{ color: e.acknowledgedAt ? "var(--muted-2)" : "var(--text)" }}>
                  <span className={`badge ${e.severity === "CRITICAL" ? "offline" : e.severity === "WARNING" ? "warning" : "neutral"}`} style={{ marginRight: 8 }}>
                    {e.severity}
                  </span>
                  {e.message}
                  <div className="small muted" style={{ marginTop: 3 }}>
                    {fmtDateTime(e.triggeredAt)} · value {e.type.includes("LOSS") || e.type.includes("PROFIT") || e.type.includes("DAILY") ? money(e.value) : e.value}
                    {e.acknowledgedAt ? " · acknowledged" : ""}
                  </div>
                </span>
                {!e.acknowledgedAt && <button className="btn sm" onClick={() => ack(e.id)}>✓</button>}
              </div>
            ))
          )}
        </div>
      </div>

      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={createAlert}>
            <h3>New alert rule</h3>
            <div className="sub">Runs against every account unless scoped to a single account via API.</div>
            <label className="field">
              <span className="lbl">TYPE</span>
              <select className="select" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="lbl">NAME (OPTIONAL)</span>
              <input className="input" maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Gold bot risk" />
            </label>
            <label className="field">
              <span className="lbl">THRESHOLD</span>
              <input className="input" type="number" min={0} step="any" required value={draft.threshold} onChange={(e) => setDraft({ ...draft, threshold: Number(e.target.value) })} />
            </label>
            <label className="field">
              <span className="lbl">SEVERITY</span>
              <select className="select" value={draft.severity} onChange={(e) => setDraft({ ...draft, severity: e.target.value })}>
                <option value="INFO">INFO</option>
                <option value="WARNING">WARNING</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </label>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn primary" type="submit">Create rule</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}


