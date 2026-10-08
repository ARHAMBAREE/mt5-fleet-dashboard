"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useResource } from "@/lib/client/useResource";
import { apiGet, apiSend, ApiClientError } from "@/lib/client/api";
import { useRealtimeStatus } from "@/lib/realtime/hooks";
import { RETENTION_OPTIONS, type RetentionOption } from "@/shared/types";

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

export default function SettingsPage() {
  const router = useRouter();
  const status = useRealtimeStatus();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [bridge, setBridge] = useState<DesktopBridge | null>(null);

  const settings = useResource<SettingsPayload>(() => apiGet("/api/settings"), []);

  useEffect(() => {
    setBridge((window as unknown as { mt5fleet?: DesktopBridge }).mt5fleet ?? null);
  }, []);

  async function save(key: string, value: unknown, note = "Saved") {
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

  const s = settings.data?.settings;

  return (
    <div>
      <div className="page-head">
        <h2>Settings</h2>
        <span className="spacer" />
        {saved && <span className="form-ok" style={{ margin: 0 }}>{saved}</span>}
        {error && <span className="form-error" style={{ margin: 0 }}>{error}</span>}
      </div>

      <a className="btn mb" href="/agents">MT5 Agents → Add Agent</a>
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
              disabled={!s}
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
          <label className="kv" style={{ cursor: "pointer" }}>
            <span className="k">Browser notifications</span>
            <span className="v">
              <input
                type="checkbox"
                checked={s?.notifications.browser ?? false}
                onChange={async (e) => {
                  if (e.target.checked && typeof Notification !== "undefined" && Notification.permission === "default") {
                    await Notification.requestPermission();
                  }
                  await save("notifications", { ...s?.notifications, browser: e.target.checked }, "Notifications updated");
                }}
              />
            </span>
          </label>
          <label className="kv" style={{ cursor: "pointer" }}>
            <span className="k">Desktop (native) notifications</span>
            <span className="v">
              <input
                type="checkbox"
                checked={s?.notifications.desktop ?? false}
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
              <label className="kv" style={{ cursor: "pointer" }}>
                <span className="k">Minimize to system tray</span>
                <span className="v">
                  <input
                    type="checkbox"
                    checked={s?.desktop.minimizeToTray ?? true}
                    onChange={(e) => {
                      bridge.setTray?.(e.target.checked);
                      void save("desktop", { ...s?.desktop, minimizeToTray: e.target.checked }, "Tray setting saved");
                    }}
                  />
                </span>
              </label>
              <label className="kv" style={{ cursor: "pointer" }}>
                <span className="k">Start with computer (Windows)</span>
                <span className="v">
                  <input
                    type="checkbox"
                    checked={s?.desktop.startOnBoot ?? false}
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

