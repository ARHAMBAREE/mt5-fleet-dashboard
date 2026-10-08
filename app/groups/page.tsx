"use client";

import { useState } from "react";
import { useResource } from "@/lib/client/useResource";
import { apiGet, apiSend, ApiClientError } from "@/lib/client/api";
import type { AccountSummary } from "@/shared/types";

interface GroupsPayload {
  groups: { id: string; name: string; color: string; count: number; isSystem?: boolean }[];
  virtual: { id: string; name: string; color: string; count: number }[];
}

export default function GroupsPage() {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [error, setError] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("");
  const [busy, setBusy] = useState(false);

  const groups = useResource<GroupsPayload>(() => apiGet("/api/groups"), []);
  const accounts = useResource<{ rows: AccountSummary[] }>(() => apiGet("/api/accounts"), []);
  const account = accounts.data?.rows.find((a) => a.id === selectedAccount);

  const membership = new Set(account?.groups.map((g) => g.id) ?? []);

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await apiSend("POST", "/api/groups", { name, color });
      setName("");
      groups.refetch();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to create group");
    } finally {
      setBusy(false);
    }
  }

  async function deleteGroup(id: string) {
    if (!confirm("Delete this group? Accounts are not affected.")) return;
    try {
      await apiSend("DELETE", `/api/groups?id=${id}`);
      groups.refetch();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Delete failed");
    }
  }

  async function toggleMembership(groupId: string) {
    if (!account) return;
    const next = new Set(membership);
    if (next.has(groupId)) next.delete(groupId);
    else next.add(groupId);
    try {
      await apiSend("PUT", "/api/groups", { accountId: account.id, groupIds: [...next] });
      accounts.refetch();
      groups.refetch();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Update failed");
    }
  }

  return (
    <div>
      <div className="page-head">
        <h2>Groups</h2>
        <span className="spacer" />
        <span className="muted small">Accounts can belong to multiple groups</span>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="grid cols-2">
        <div className="card">
          <div className="card-title">Your Groups</div>
          <form className="flex mb" onSubmit={createGroup} style={{ marginBottom: 14 }}>
            <input className="input" style={{ maxWidth: 200 }} placeholder="NEW GROUP NAME" value={name} onChange={(e) => setName(e.target.value.toUpperCase())} maxLength={40} required />
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 42, height: 36, border: "none", background: "transparent" }} title="Group color" />
            <button className="btn primary sm" disabled={busy}>Create</button>
          </form>

          <div className="chips">
            <span className="chip active" title="Virtual group: always available">
              <span className="swatch" style={{ background: "#94a3b8" }} /> ALL
              <span className="muted small">{groups.data?.virtual[0]?.count ?? 0}</span>
            </span>
            {(groups.data?.groups ?? []).map((g) => (
              <span key={g.id} className="chip" style={{ cursor: "default" }}>
                <span className="swatch" style={{ background: g.color }} />
                {g.name}
                <span className="muted small">{g.count}</span>
                {!g.isSystem && (
                  <button className="btn sm ghost" style={{ padding: "0 4px", border: "none" }} title="Delete group" onClick={() => deleteGroup(g.id)}>
                    ✕
                  </button>
                )}
              </span>
            ))}
          </div>

          <div className="small muted mt">
            LIVE / DEMO are system groups (created automatically). Custom ideas: GOLD, FOREX, BOT A, BOT B,
            HIGH RISK, LOW RISK.
          </div>
        </div>

        <div className="card">
          <div className="card-title">Assign Account to Groups</div>
          <label className="field">
            <span className="lbl">ACCOUNT</span>
            <select className="select" value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}>
              <option value="">Select an account…</option>
              {(accounts.data?.rows ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.login} — {a.broker} ({a.mode})
                </option>
              ))}
            </select>
          </label>

          {!account ? (
            <div className="empty" style={{ padding: 20 }}>
              <div className="big">❖</div>
              Select an account to edit its group memberships.
            </div>
          ) : (
            <div className="chips">
              {(groups.data?.groups ?? []).map((g) => (
                <button key={g.id} className={`chip ${membership.has(g.id) ? "active" : ""}`} onClick={() => toggleMembership(g.id)}>
                  <span className="swatch" style={{ background: g.color }} />
                  {g.name}
                  {membership.has(g.id) && " ✓"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
