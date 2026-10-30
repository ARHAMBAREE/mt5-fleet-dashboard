"use client";

import { useState } from "react";
import { useResource } from "@/lib/client/useResource";
import { useLiveRefresh } from "@/lib/realtime/hooks";
import { apiGet, apiSend, ApiClientError } from "@/lib/client/api";
import StatusBadge from "@/components/ui/StatusBadge";
import { fmtDateTime, lastSeenLabel } from "@/lib/format";
import { useCurrentUser } from "@/lib/client/useUser";

interface AgentRow {
  id: string; name: string; status: string; platform: string | null;
  terminalCompany: string | null; terminalName: string | null; terminalBuild: number | null;
  eaVersion: string | null; pairedAt: string; revokedAt: string | null; lastSeenAt: string | null;
  statusValue: string; accountsCount: number;
  lastHeartbeat: { at: string; accountLogin: string | null; broker: string | null; eaLoaded: boolean } | null;
}

interface AgentsPayload {
  agents: AgentRow[];
  pairingCodes: { id: string; label: string | null; prefix: string; expiresAt: string; createdAt: string }[];
}

export default function AgentsPage() {
  const { isViewer } = useCurrentUser();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const agents = useResource<AgentsPayload>(() => apiGet("/api/agents"), []);
  useLiveRefresh(() => agents.refetch(), ["agents:update", "heartbeat", "__resync__"]);

  async function addAgent() {
    setError("");
    setBusy(true);
    try {
      const res = await apiSend<{ code: string; expiresAt: string }>("POST", "/api/agents", {});
      setNewCode(res);
      setCopied(false);
      agents.refetch();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not generate a pairing code");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string, name: string) {
    if (!confirm(`Revoke "${name}"? Its credential stops working immediately and linked accounts go OFFLINE until re-paired. Account data is kept.`)) return;
    try {
      await apiSend("DELETE", `/api/agents/${id}`);
      agents.refetch();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Revoke failed");
    }
  }

  async function deleteAgent(id: string, name: string) {
    if (!confirm(`Permanently remove revoked agent "${name}" from your dashboard?`)) return;
    try {
      await apiSend("DELETE", `/api/agents/${id}?permanent=true`);
      agents.refetch();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Delete failed");
    }
  }

  async function deleteAllRevoked() {
    const count = agents.data?.agents.filter((a) => a.status === "REVOKED").length ?? 0;
    if (!confirm(`Permanently delete all ${count} revoked agent installations?`)) return;
    try {
      await apiSend("DELETE", "/api/agents");
      agents.refetch();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Delete all revoked failed");
    }
  }

  async function copyCode() {
    if (!newCode) return;
    try {
      await navigator.clipboard.writeText(newCode.code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "https://YOUR-DOMAIN.com";

  return (
    <div>
      <div className="page-head">
        <h2>MT5 Agents</h2>
        <span className="pill-count">{agents.data?.agents.filter((a) => a.status === "ACTIVE").length ?? 0} active</span>
        {(agents.data?.agents.filter((a) => a.status === "REVOKED").length ?? 0) > 0 && (
          <span className="pill-count" style={{ background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", borderColor: "rgba(239, 68, 68, 0.3)" }}>
            {agents.data?.agents.filter((a) => a.status === "REVOKED").length} revoked
          </span>
        )}
        <span className="spacer" />
        {!isViewer && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {(agents.data?.agents.filter((a) => a.status === "REVOKED").length ?? 0) > 0 && (
              <button
                className="btn sm danger"
                onClick={deleteAllRevoked}
                title="Permanently remove all revoked agent installations"
              >
                🗑 Delete All Revoked ({agents.data?.agents.filter((a) => a.status === "REVOKED").length})
              </button>
            )}
            <a className="btn" href="/licenses">🔑 EA Licenses</a>
            <button className="btn primary" onClick={addAgent} disabled={busy}>
              {busy ? "Generating…" : "＋ Add Agent"}
            </button>
          </div>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="card tight mb">
        <div style={{ padding: "14px 16px" }}>
          <div className="card-title">Paired installations</div>
        </div>
        <div className="table-wrap" style={{ border: "none" }}>
          <table className="data" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>Status</th><th>Name</th><th>Terminal</th><th>Platform</th>
                <th>Accounts</th><th>Last heartbeat</th><th>Paired</th><th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(agents.data?.agents ?? []).map((a) => (
                <tr key={a.id}>
                  <td>
                    <StatusBadge status={a.status === "REVOKED" ? "OFFLINE" : a.statusValue} label={a.status === "REVOKED" ? "REVOKED" : a.statusValue} />
                  </td>
                  <td>
                    <div className="bold">{a.name}</div>
                    <div className="small muted mono">{a.id.slice(0, 8)}…</div>
                  </td>
                  <td>
                    {a.terminalCompany || "—"} {a.terminalName && <span className="muted">· {a.terminalName}</span>}
                    {a.terminalBuild ? <span className="muted small"> build {a.terminalBuild}</span> : null}
                  </td>
                  <td className="muted">{a.platform ?? "—"}</td>
                  <td className="num">{a.accountsCount}</td>
                  <td>
                    <span className="small muted num" title={a.lastSeenAt ?? ""}>
                      {lastSeenLabel(a.lastSeenAt)}
                    </span>
                    {a.lastHeartbeat && (
                      <div className="small muted">
                        {a.lastHeartbeat.accountLogin ?? "?"} {a.lastHeartbeat.broker ? `· ${a.lastHeartbeat.broker}` : ""}
                      </div>
                    )}
                  </td>
                  <td className="small muted">{fmtDateTime(a.pairedAt)}</td>
                  <td className="right">
                    {a.status === "ACTIVE" && !isViewer && (
                      <button className="btn sm danger" onClick={() => revoke(a.id, a.name)}>Revoke</button>
                    )}
                    {a.status === "REVOKED" && !isViewer && (
                      <button className="btn sm danger" onClick={() => deleteAgent(a.id, a.name)} title="Permanently delete this revoked agent">Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!agents.loading && (agents.data?.agents.length ?? 0) === 0 && (
            <div className="empty">
              <div className="big">⚑</div>
              <div className="bold">No agents paired yet</div>
              <div className="small muted mt">Click “Add Agent”, then enter the pairing code in the EA inputs.</div>
            </div>
          )}
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="card-title">Setup instructions</div>
          <div className="kv"><span className="k">1. Allow WebRequest</span><span className="v small">Tools → Options → Expert Advisors</span></div>
          <div className="kv"><span className="k">2. Add this URL</span><span className="v mono small">{origin}</span></div>
          <a className="btn sm mb" href="/downloads/MT5FleetAgent.mq5" download>Download MT5 Agent</a>
          <div className="kv"><span className="k">3. Compile EA</span><span className="v small">mt5-agent/MT5FleetAgent.mq5 → Compile</span></div>
          <div className="kv"><span className="k">4. Attach to chart</span><span className="v small">Inputs: ServerUrl + PairingCode</span></div>
          <div className="kv"><span className="k">5. Enable Algo Trading</span><span className="v small">EA does monitoring only — never trades</span></div>
          <div className="small muted mt">
            The EA never asks for trading or investor passwords. It only needs the server URL and a pairing code.
          </div>
        </div>

        <div className="card">
          <div className="card-title">Pending pairing codes</div>
          {(agents.data?.pairingCodes ?? []).length === 0 ? (
            <div className="empty" style={{ padding: 20 }}>
              <div className="big">⚿</div>
              No active codes. Each code is single-use and expires after 15 minutes.
            </div>
          ) : (
            (agents.data?.pairingCodes ?? []).map((c) => (
              <div key={c.id} className="kv">
                <span className="k">
                  <span className="mono">{c.prefix}-•••-•••</span>
                  {c.label && <span className="muted"> · {c.label}</span>}
                </span>
                <span className="v small muted">expires {fmtDateTime(c.expiresAt)}</span>
              </div>
            ))
          )}
          <div className="small muted mt">
            The full code is shown exactly once (in the dialog after “Add Agent”). Generate a new code if it expires.
          </div>
        </div>
      </div>

      {newCode && (
        <div className="modal-backdrop" onClick={() => setNewCode(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Pairing code generated</h3>
            <div className="sub">Enter this code in the EA input “PairingCode”. Single-use · expires {fmtDateTime(newCode.expiresAt)}.</div>

            <div
              className="mono"
              style={{
                fontSize: 34, fontWeight: 800, letterSpacing: 4, textAlign: "center",
                padding: "22px 10px", background: "var(--bg-2)", border: "1px dashed var(--border-2)",
                borderRadius: 12, color: "var(--accent-2)",
              }}
            >
              {newCode.code}
            </div>

            <div className="flex mt" style={{ justifyContent: "center" }}>
              <button className="btn primary" onClick={copyCode}>{copied ? "✓ Copied" : "Copy code"}</button>
              <button className="btn" onClick={() => setNewCode(null)}>Done</button>
            </div>

            <div className="mt">
              <div className="small muted bold mb">EA INPUTS</div>
              <div className="kv"><span className="k">ServerUrl</span><span className="v mono small">{origin}</span></div>
              <div className="kv"><span className="k">PairingCode</span><span className="v mono small">{newCode.code}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

