"use client";

import { useState } from "react";
import { useResource } from "@/lib/client/useResource";
import { apiGet, apiSend, ApiClientError } from "@/lib/client/api";
import StatusBadge from "@/components/ui/StatusBadge";
import { fmtDateTime } from "@/lib/format";
import { useCurrentUser } from "@/lib/client/useUser";

interface LicenseItem {
  id: string;
  licenseKey: string;
  accountNumber: number | null;
  isActive: boolean;
  expiresAt: string | null;
  lastVerifiedAt: string | null;
  notes: string | null;
  createdAt: string;
  createdBy?: { id: string; name: string; email: string } | null;
}

interface LicensesResponse {
  ok: boolean;
  total: number;
  page: number;
  pageSize: number;
  licenses: LicenseItem[];
}

export default function LicensesPage() {
  const { isOwner } = useCurrentUser();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  // Modal / Form state for generating new license
  const [showModal, setShowModal] = useState(false);
  const [expiryDays, setExpiryDays] = useState<number>(365);
  const [customAccount, setCustomAccount] = useState("");
  const [notes, setNotes] = useState("");
  const [count, setCount] = useState<number>(1);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const queryParams = new URLSearchParams();
  if (search.trim()) queryParams.set("q", search.trim());
  if (statusFilter !== "all") queryParams.set("status", statusFilter);

  const licensesRes = useResource<LicensesResponse>(
    () => apiGet(`/api/licenses?${queryParams.toString()}`),
    [search, statusFilter]
  );

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);

    try {
      const payload: {
        expiryDays?: number;
        expiryDate?: string;
        accountNumber?: string | null;
        notes?: string;
        count: number;
      } = {
        count,
        notes: notes.trim() || undefined,
        accountNumber: customAccount.trim() ? customAccount.trim() : null,
      };

      if (expiryDays > 0) {
        payload.expiryDays = expiryDays;
      }

      const res = await apiSend<{ ok: boolean; count: number; licenses: LicenseItem[] }>(
        "POST",
        "/api/licenses",
        payload
      );

      setSuccess(`Successfully generated ${res.count} license key(s)!`);
      setShowModal(false);
      setCustomAccount("");
      setNotes("");
      licensesRes.refetch();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to generate license");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(id: string, currentActive: boolean) {
    setError("");
    setSuccess("");
    try {
      await apiSend("PATCH", `/api/licenses/${id}`, { isActive: !currentActive });
      setSuccess(`License ${!currentActive ? "activated" : "deactivated"} successfully.`);
      licensesRes.refetch();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to update license status");
    }
  }

  async function resetAccount(id: string, currentAccount: number) {
    if (!confirm(`Reset account binding for MT5 account ${currentAccount}? The client will be able to bind a new account on next launch.`)) return;
    setError("");
    setSuccess("");
    try {
      await apiSend("PATCH", `/api/licenses/${id}`, { accountNumber: null });
      setSuccess("Account binding reset successfully.");
      licensesRes.refetch();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to reset account");
    }
  }

  async function deleteLicense(id: string, key: string) {
    if (!confirm(`Permanently delete license ${key}? This action cannot be undone.`)) return;
    setError("");
    setSuccess("");
    try {
      await apiSend("DELETE", `/api/licenses/${id}`);
      setSuccess("License deleted permanently.");
      licensesRes.refetch();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to delete license");
    }
  }

  function copyToClipboard(key: string) {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  }

  const items = licensesRes.data?.licenses ?? [];

  return (
    <div className="content-stack">
      <div className="section-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 className="page-title">EA Licenses</h1>
          <p className="page-subtitle">
            Securely issue, lock, and verify MetaTrader 5 Expert Advisor licenses.
          </p>
        </div>
        {isOwner && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowModal(true)}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <span>+</span> Generate License
          </button>
        )}
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: "1rem" }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: "1rem" }}>{success}</div>}

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: "1rem", marginBottom: "1rem" }}>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: "1 1 240px" }}>
            <input
              type="text"
              className="input"
              placeholder="Search by key, MT5 account, or client notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <label style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Status:</label>
            <select
              className="input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Revoked / Inactive</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => licensesRes.refetch()}
            disabled={licensesRes.loading}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Table Card */}
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
              <th style={{ padding: "0.75rem 1rem" }}>License Key</th>
              <th style={{ padding: "0.75rem 1rem" }}>Bound MT5 Account</th>
              <th style={{ padding: "0.75rem 1rem" }}>Status</th>
              <th style={{ padding: "0.75rem 1rem" }}>Expires</th>
              <th style={{ padding: "0.75rem 1rem" }}>Last Verified</th>
              <th style={{ padding: "0.75rem 1rem" }}>Notes / Client</th>
              {isOwner && <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {licensesRes.loading && items.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                  Loading licenses...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "3rem 1rem", textAlign: "center", color: "var(--text-muted)" }}>
                  No licenses found. Click &quot;Generate License&quot; to create your first key.
                </td>
              </tr>
            ) : (
              items.map((lic) => {
                const isExpired = lic.expiresAt && new Date(lic.expiresAt) < new Date();
                const statusBadge = !lic.isActive ? (
                  <StatusBadge status="OFFLINE" label="Revoked" />
                ) : isExpired ? (
                  <StatusBadge status="WARNING" label="Expired" />
                ) : (
                  <StatusBadge status="ONLINE" label="Active" />
                );

                return (
                  <tr key={lic.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "0.75rem 1rem", fontFamily: "var(--font-mono, monospace)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontWeight: 600 }}>{lic.licenseKey}</span>
                        <button
                          type="button"
                          className="btn btn-xs btn-ghost"
                          onClick={() => copyToClipboard(lic.licenseKey)}
                          title="Copy license key"
                        >
                          {copiedKey === lic.licenseKey ? "✓ Copied" : "Copy"}
                        </button>
                      </div>
                    </td>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      {lic.accountNumber ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <span style={{ fontWeight: 600, fontFamily: "var(--font-mono, monospace)" }}>
                            {lic.accountNumber}
                          </span>
                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>[Locked]</span>
                          {isOwner && (
                            <button
                              type="button"
                              className="btn btn-xs btn-ghost"
                              onClick={() => resetAccount(lic.id, lic.accountNumber!)}
                              title="Reset bound account"
                              style={{ color: "var(--text-warning)" }}
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: "0.85rem", fontStyle: "italic" }}>
                          Auto-bind on first use
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "0.75rem 1rem" }}>{statusBadge}</td>
                    <td style={{ padding: "0.75rem 1rem", fontSize: "0.875rem" }}>
                      {lic.expiresAt ? fmtDateTime(lic.expiresAt) : "Lifetime"}
                    </td>
                    <td style={{ padding: "0.75rem 1rem", fontSize: "0.875rem", color: "var(--text-muted)" }}>
                      {lic.lastVerifiedAt ? fmtDateTime(lic.lastVerifiedAt) : "Never"}
                    </td>
                    <td style={{ padding: "0.75rem 1rem", fontSize: "0.875rem" }}>
                      {lic.notes || "—"}
                    </td>
                    {isOwner && (
                      <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "0.4rem" }}>
                          <button
                            type="button"
                            className="btn btn-xs btn-ghost"
                            onClick={() => toggleStatus(lic.id, lic.isActive)}
                          >
                            {lic.isActive ? "Revoke" : "Activate"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-xs btn-ghost"
                            style={{ color: "var(--text-danger)" }}
                            onClick={() => deleteLicense(lic.id, lic.licenseKey)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Generate Modal */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: "500px",
              padding: "1.5rem",
              borderRadius: "0.5rem",
              background: "var(--bg-surface)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.25rem" }}>Generate New License Key</h3>
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                onClick={() => setShowModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGenerate}>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", fontWeight: 500 }}>
                  Validity Period
                </label>
                <select
                  className="input"
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(parseInt(e.target.value, 10))}
                  style={{ width: "100%" }}
                >
                  <option value={30}>30 Days (1 Month)</option>
                  <option value={90}>90 Days (3 Months)</option>
                  <option value={180}>180 Days (6 Months)</option>
                  <option value={365}>365 Days (1 Year)</option>
                  <option value={0}>Lifetime (No Expiry)</option>
                </select>
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", fontWeight: 500 }}>
                  Pre-bind MT5 Account Number (Optional)
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. 10529482 (leave empty for auto-bind on first use)"
                  value={customAccount}
                  onChange={(e) => setCustomAccount(e.target.value)}
                  style={{ width: "100%" }}
                />
                <small style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                  If left empty, the key will automatically lock to the first MT5 account that verifies it.
                </small>
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", fontWeight: 500 }}>
                  Client Name / Notes (Optional)
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. John Doe - Premium Telegram Member"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ marginBottom: "1.5rem" }}>
                <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", fontWeight: 500 }}>
                  Quantity
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  className="input"
                  value={count}
                  onChange={(e) => setCount(parseInt(e.target.value, 10) || 1)}
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy}
                >
                  {busy ? "Generating..." : "Generate Key"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

