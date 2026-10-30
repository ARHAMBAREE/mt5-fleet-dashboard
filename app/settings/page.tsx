"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useResource } from "@/lib/client/useResource";
import { apiGet, apiSend, ApiClientError } from "@/lib/client/api";
import { useRealtimeStatus } from "@/lib/realtime/hooks";
import { useCurrentUser } from "@/lib/client/useUser";
import { RETENTION_OPTIONS, type RetentionOption, type Role } from "@/shared/types";
import { fmtDateTime } from "@/lib/format";

interface SettingsPayload {
  settings: {
    retention: { period: RetentionOption };
    notifications: { browser: boolean; desktop: boolean; minSeverity: string };
    desktop: { minimizeToTray: boolean; startOnBoot: boolean; notifyEnabled: boolean };
  };
}

interface DesktopBridge {
  notify?: (t: string, b: string) => void;
  checkForUpdates?: () => void;
  setStartup?: (enabled: boolean) => void;
  setTray?: (enabled: boolean) => void;
  getVersion?: () => string;
}

interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const status = useRealtimeStatus();
  const { isViewer, isAdmin, isOwner, user: currentUser } = useCurrentUser();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [bridge, setBridge] = useState<DesktopBridge | null>(null);

  // User management state
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userError, setUserError] = useState("");
  const [userSuccess, setUserSuccess] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"VIEWER" | "ADMIN">("VIEWER");

  const settings = useResource<SettingsPayload>(() => apiGet("/api/settings"), []);

  useEffect(() => {
    setBridge((window as unknown as { mt5fleet?: DesktopBridge }).mt5fleet ?? null);
  }, []);

  const loadUsers = useCallback(async () => {
    if (isViewer) return;
    setUsersLoading(true);
    try {
      const res = await apiGet<{ ok: boolean; users: UserRecord[] }>("/api/users");
      if (res.ok && Array.isArray(res.users)) {
        setUsers(res.users);
      }
    } catch {
      // User management only available for ADMIN / OWNER
    } finally {
      setUsersLoading(false);
    }
  }, [isViewer]);

  useEffect(() => {
    if (!isViewer) {
      void loadUsers();
    }
  }, [isViewer, loadUsers]);

  async function save(key: string, value: unknown, note = "Saved") {
    if (isViewer) return;
    setError("");
    setSaved("");
    try {
      await apiSend("PUT", "/api/settings", { key, value });
      setSaved(note);
      settings.refetch();
      setTimeout(() => setSaved(""), 2500);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Save failed");
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setUserError("");
    setUserSuccess("");
    if (!newEmail || !newPassword) {
      setUserError("Email and password are required");
      return;
    }
    if (newPassword.length < 6) {
      setUserError("Password must be at least 6 characters long");
      return;
    }

    setCreatingUser(true);
    try {
      await apiSend("POST", "/api/users", {
        email: newEmail.trim(),
        name: newName.trim() || newEmail.split("@")[0],
        password: newPassword,
        role: newRole,
      });
      setUserSuccess(`Successfully created ${newRole === "VIEWER" ? "Viewer" : "Admin"} login for ${newEmail}`);
      setNewEmail("");
      setNewName("");
      setNewPassword("");
      setNewRole("VIEWER");
      void loadUsers();
      setTimeout(() => setUserSuccess(""), 4000);
    } catch (err) {
      setUserError(err instanceof ApiClientError ? err.message : "Failed to create user");
    } finally {
      setCreatingUser(false);
    }
  }

  async function handleDeleteUser(userId: string, email: string) {
    if (!confirm(`Are you sure you want to delete login for ${email}?`)) return;
    setUserError("");
    setUserSuccess("");
    try {
      await apiSend("DELETE", `/api/users/${userId}`);
      setUserSuccess(`User ${email} deleted`);
      void loadUsers();
      setTimeout(() => setUserSuccess(""), 3000);
    } catch (err) {
      setUserError(err instanceof ApiClientError ? err.message : "Failed to delete user");
    }
  }

  const s = settings.data?.settings;

  return (
    <div>
      <div className="page-head">
        <h2>Settings</h2>
        <span className="spacer" />
        {saved && <span className="form-ok" style={{ margin: 0 }}>{saved}</span>}
        {error && <span className="form-error" style={{ margin: 0 }}>{error}</span>}
      </div>

      {isViewer && (
        <div className="card mb" style={{ borderLeft: "4px solid #94a3b8", background: "rgba(148, 163, 184, 0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 24 }}>👁️</span>
            <div>
              <strong style={{ fontSize: 14 }}>Viewer Mode (Read-Only)</strong>
              <div className="small muted">
                You are signed in with read-only permissions. You have full visibility into live accounts, metrics,
                positions, and charts, but settings, agent pairing, and user access management are restricted.
              </div>
            </div>
          </div>
        </div>
      )}

      {!isViewer && (
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <a className="btn" href="/agents">MT5 Agents → Add Agent</a>
          <a className="btn primary" href="/licenses">🔑 EA Licenses → Generate & Manage</a>
        </div>
      )}

      {/* Role-Based User Management (Admin / Owner Only) */}
      {!isViewer && (
        <div className="card mb" style={{ borderColor: "rgba(99, 102, 241, 0.3)" }}>
          <div className="card-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Users &amp; Access Control</span>
            <span className="small muted">Role-Based Logins</span>
          </div>
          <div className="small muted mb">
            Create separate logins with distinct privileges. <strong>Admins</strong> have full management access, while <strong>Viewers</strong> can only inspect the dashboard, accounts, and analytics without modifying anything.
          </div>

          {userSuccess && <div className="form-ok mb">{userSuccess}</div>}
          {userError && <div className="form-error mb">{userError}</div>}

          {/* Create User Form */}
          <form onSubmit={handleCreateUser} style={{ background: "rgba(255, 255, 255, 0.03)", padding: 14, borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>＋ Create New Login</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, alignItems: "flex-end" }}>
              <label className="field" style={{ margin: 0 }}>
                <span className="lbl">NAME / LABEL</span>
                <input
                  className="input"
                  placeholder="e.g. Investor John"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={creatingUser}
                />
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span className="lbl">EMAIL ADDRESS *</span>
                <input
                  type="email"
                  className="input"
                  placeholder="viewer@example.com"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  disabled={creatingUser}
                />
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span className="lbl">PASSWORD *</span>
                <input
                  type="password"
                  className="input"
                  placeholder="Min 6 characters"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={creatingUser}
                />
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span className="lbl">ROLE *</span>
                <select
                  className="select"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as "VIEWER" | "ADMIN")}
                  disabled={creatingUser}
                >
                  <option value="VIEWER">Viewer (Read-Only)</option>
                  <option value="ADMIN">Administrator (Full Access)</option>
                </select>
              </label>
              <button type="submit" className="btn primary" disabled={creatingUser} style={{ height: 38 }}>
                {creatingUser ? "Creating…" : "Create Login"}
              </button>
            </div>
          </form>

          {/* Existing Users Table */}
          <div className="table-wrap" style={{ border: "none" }}>
            <table className="data" style={{ minWidth: 500 }}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th className="right">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isCurrent = u.id === currentUser?.id;
                  const isOwnerUser = u.role === "OWNER";
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="bold">{u.name || u.email.split("@")[0]}</div>
                        <div className="small muted">{u.email}</div>
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: 4,
                            background:
                              u.role === "OWNER"
                                ? "rgba(234, 179, 8, 0.2)"
                                : u.role === "ADMIN"
                                ? "rgba(99, 102, 241, 0.2)"
                                : "rgba(148, 163, 184, 0.2)",
                            color:
                              u.role === "OWNER"
                                ? "#eab308"
                                : u.role === "ADMIN"
                                ? "#818cf8"
                                : "#94a3b8",
                          }}
                        >
                          {u.role === "VIEWER" ? "VIEWER (READ-ONLY)" : u.role === "ADMIN" ? "ADMIN" : "OWNER"}
                        </span>
                      </td>
                      <td className="small muted">{fmtDateTime(u.createdAt)}</td>
                      <td className="right">
                        {isCurrent ? (
                          <span className="small muted">You</span>
                        ) : isOwnerUser ? (
                          <span className="small muted">Primary Owner</span>
                        ) : (
                          <button
                            className="btn sm danger"
                            onClick={() => handleDeleteUser(u.id, u.email)}
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {usersLoading && users.length === 0 && (
              <div className="small muted" style={{ padding: 12 }}>Loading users…</div>
            )}
          </div>
        </div>
      )}

      <div className="grid cols-2">
        <div className="card">
          <div className="card-title">Data retention</div>
          <div className="small muted mb">
            Applies only to historical snapshots (equity + account snapshots). Current account state, positions,
            orders, heartbeats and alert events are never deleted.
          </div>
          <label className="field">
            <span className="lbl">KEEP HISTORY FOR</span>
            <select
              className="select"
              value={s?.retention.period ?? "90d"}
              onChange={(e) => save("retention", { period: e.target.value }, "Retention updated")}
              disabled={isViewer || !s}
            >
              {RETENTION_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt === "unlimited" ? "Unlimited" : opt === "1y" ? "1 year" : `${opt.replace("d", "")} days`}
                </option>
              ))}
            </select>
          </label>
          <div className="small muted">Pruning runs automatically every 5 minutes via Vercel Cron.</div>
        </div>

        <div className="card">
          <div className="card-title">Notifications</div>
          <label className="kv" style={{ cursor: isViewer ? "not-allowed" : "pointer" }}>
            <span className="k">Browser notifications</span>
            <span className="v">
              <input
                type="checkbox"
                checked={s?.notifications.browser ?? false}
                disabled={isViewer}
                onChange={async (e) => {
                  if (e.target.checked && typeof Notification !== "undefined" && Notification.permission === "default") {
                    await Notification.requestPermission();
                  }
                  await save("notifications", { ...s?.notifications, browser: e.target.checked }, "Notifications updated");
                }}
              />
            </span>
          </label>
          <label className="kv" style={{ cursor: isViewer ? "not-allowed" : "pointer" }}>
            <span className="k">Desktop (native) notifications</span>
            <span className="v">
              <input
                type="checkbox"
                checked={s?.notifications.desktop ?? false}
                disabled={isViewer}
                onChange={(e) => save("notifications", { ...s?.notifications, desktop: e.target.checked }, "Notifications updated")}
              />
            </span>
          </label>
          <div className="small muted mt">
            Toast alerts always appear in-app. Native notifications require permission (topbar 🔔).
          </div>
        </div>

        <div className="card">
          <div className="card-title">Desktop application {bridge ? "" : "(web build)"}</div>
          {!bridge ? (
            <div className="small muted">
              Install the packaged desktop app (MT5 Fleet Dashboard.exe) to get system tray, startup, and native
              notifications. The web and desktop apps share this exact backend.
            </div>
          ) : (
            <>
              <label className="kv" style={{ cursor: isViewer ? "not-allowed" : "pointer" }}>
                <span className="k">Minimize to system tray</span>
                <span className="v">
                  <input
                    type="checkbox"
                    checked={s?.desktop.minimizeToTray ?? true}
                    disabled={isViewer}
                    onChange={(e) => {
                      bridge.setTray?.(e.target.checked);
                      void save("desktop", { ...s?.desktop, minimizeToTray: e.target.checked }, "Tray setting saved");
                    }}
                  />
                </span>
              </label>
              <label className="kv" style={{ cursor: isViewer ? "not-allowed" : "pointer" }}>
                <span className="k">Start with computer (Windows)</span>
                <span className="v">
                  <input
                    type="checkbox"
                    checked={s?.desktop.startOnBoot ?? false}
                    disabled={isViewer}
                    onChange={(e) => {
                      bridge.setStartup?.(e.target.checked);
                      void save("desktop", { ...s?.desktop, startOnBoot: e.target.checked }, "Startup setting saved");
                    }}
                  />
                </span>
              </label>
              <div className="kv">
                <span className="k">Version</span>
                <span className="v mono small">{bridge.getVersion?.() ?? "1.0.0"}</span>
              </div>
              <button className="btn sm mt" onClick={() => bridge.checkForUpdates?.()}>Check for updates</button>
            </>
          )}
        </div>

        <div className="card">
          <div className="card-title">System</div>
          <div className="kv"><span className="k">Backend origin</span><span className="v mono small">{typeof window !== "undefined" ? window.location.origin : ""}</span></div>
          <div className="kv"><span className="k">Realtime transport</span><span className="v">{status.toUpperCase()}</span></div>
          <div className="kv"><span className="k">Session</span><span className="v small">Secure HttpOnly cookie (JWT + DB revocation)</span></div>
          <div className="kv"><span className="k">Agent auth</span><span className="v small">Pairing code → hashed credential</span></div>
          <div className="flex mt">
            <button className="btn sm" onClick={() => window.open("/api/export?type=accounts&format=csv", "_blank")}>⬇ Accounts CSV</button>
          </div>
          <div className="mt">
            <button
              className="btn danger sm"
              onClick={async () => {
                try { await apiSend("POST", "/api/auth/logout", {}); } catch { /* ignore */ }
                sessionStorage.removeItem("mt5fleet.cursor");
                window.location.assign("/login");
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
