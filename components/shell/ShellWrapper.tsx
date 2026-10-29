"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtimeEvents, useRealtimeStatus } from "@/lib/realtime/hooks";
import { apiGet, apiSend, ApiClientError } from "@/lib/client/api";
import { UserProvider } from "@/lib/client/useUser";
import type { Role } from "@/shared/types";

function ThemeIcon({kind}:{kind:string}) {
  const paths: Record<string,React.ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h7v7h-7z"/></>,
    accounts: <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M3 13h5l2 3h4l2-3h5"/></>,
    alerts: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
    positions: <path d="m2 13 5 0 3-10 4 18 3-8h5"/>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 15v2"/></>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>
  };
  return <svg className="theme-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[kind] ?? <path d="M4 6h16M4 12h16M4 18h16"/>}</svg>;
}

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/accounts", label: "Accounts", icon: "▤" },
  { href: "/groups", label: "Groups", icon: "❖" },
  { href: "/positions", label: "Positions", icon: "⇄" },
  { href: "/orders", label: "Orders", icon: "≡" },
  { href: "/analytics", label: "Analytics", icon: "∿" },
  { href: "/alerts", label: "Alerts", icon: "⚠" },
  { href: "/agents", label: "Agents", icon: "⚑" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

const MOBILE_NAV = NAV_ITEMS.filter((i) =>
  ["/dashboard", "/accounts", "/positions", "/alerts"].includes(i.href)
);

interface Me {
  user: { id: string; email: string; name: string; role: Role };
  counts?: { unacknowledgedAlerts?: number; accounts?: number; online?: number };
}

interface Toast {
  id: string;
  severity: string;
  title: string;
  body: string;
}

function titleFor(path: string): string {
  const item = NAV_ITEMS.find((i) => path === i.href || path.startsWith(`${i.href}/`));
  if (item) return item.label;
  if (path.startsWith("/accounts/")) return "Account Detail";
  return "MT5 Fleet Dashboard";
}

export default function ShellWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const status = useRealtimeStatus();
  const [me, setMe] = useState<Me | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [unack, setUnack] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const toastTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const bare = pathname === "/" || pathname === "/login" || pathname === "/register";

  const loadMe = useCallback(async () => {
    try {
      const data = await apiGet<Me>("/api/auth/me");
      setMe(data);
      setUnack(data.counts?.unacknowledgedAlerts ?? 0);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    if (!bare) void loadMe();
  }, [loadMe, bare]);

  const pushToast = useCallback(async (t: Toast) => {
    setToasts((prev) => [...prev.filter((x) => x.id !== t.id), t].slice(-4));
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== t.id));
      toastTimers.current.delete(t.id);
    }, 8000);
    toastTimers.current.set(t.id, timer);

    // Native notification: Electron preload bridge or browser Notification API.
    const bridge = (window as unknown as { mt5fleet?: { notify?: (t: string, b: string) => void } }).mt5fleet;
    try {
      const prefs = await apiGet<{ settings: { notifications: { browser: boolean; desktop: boolean; minSeverity: string } } }>("/api/settings");
      const n = prefs.settings.notifications;
      const rank: Record<string, number> = { INFO: 0, WARNING: 1, CRITICAL: 2 };
      if ((rank[t.severity] ?? 0) < (rank[n.minSeverity] ?? 0)) return;
      if (bridge?.notify && n.desktop) bridge.notify(t.title, t.body);
      else if (!bridge && n.browser && typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(t.title, { body: t.body, tag: t.id });
      }
    } catch { /* notifications unavailable */ }
  }, []);

  useRealtimeEvents(
    useCallback(
      (e) => {
        if (e.type === "alerts:new") {
          const d = (e.data ?? {}) as { severity?: string; message?: string; id?: string };
          setUnack((n) => n + 1);
          pushToast({ id: d.id ?? String(e.ts), severity: d.severity ?? "WARNING", title: "Alert", body: d.message ?? "Alert triggered" });
        } else if (e.type === "__resync__") {
          void loadMe();
        }
      },
      [pushToast, loadMe]
    )
  );

  async function logout() {
    try {
      await apiSend("POST", "/api/auth/logout", {});
    } catch { /* session may already be gone */ }
    sessionStorage.removeItem("mt5fleet.cursor");
    window.location.assign("/login");
  }

  async function enableNotifications() {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }

  if (bare) return <>{children}</>;

  const connClass =
    status === "live" ? "live" : status === "poll" ? "poll" : status === "retry" || status === "connecting" ? "retry" : "";
  const connLabel =
    status === "live" ? "REALTIME" :
    status === "poll" ? "POLLING" :
    status === "retry" ? "RECONNECTING" :
    status === "connecting" ? "CONNECTING" : "OFFLINE";

  return (
    <UserProvider user={me?.user ?? null}>
      <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo">F5</span>
          <span>MT5 Fleet</span>
        </div>
        <nav className="nav">
          <span className="nav-label">Monitoring</span>
          {NAV_ITEMS.slice(0, 7).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${pathname === item.href || pathname.startsWith(`${item.href}/`) ? "active" : ""}`}
            >
              <ThemeIcon kind={item.href.slice(1)}/>
              {item.label}
              {item.href === "/alerts" && unack > 0 && <span className="nav-badge">{unack}</span>}
            </Link>
          ))}
          <span className="nav-label">System</span>
          {NAV_ITEMS.slice(7).map((item) => (
            <Link key={item.href} href={item.href} className={`nav-item ${pathname.startsWith(item.href) ? "active" : ""}`}>
              <ThemeIcon kind={item.href.slice(1)}/>
              {item.label}
            </Link>
          ))}
        </nav>
        <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)", fontSize: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", fontSize: 11 }}>
              {me?.user.email ?? "…"}
            </span>
            {me?.user.role && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: me.user.role === "VIEWER" ? "rgba(148, 163, 184, 0.2)" : "rgba(99, 102, 241, 0.2)",
                  color: me.user.role === "VIEWER" ? "#94a3b8" : "var(--primary, #6366f1)",
                }}
              >
                {me.user.role === "VIEWER" ? "VIEWER" : me.user.role === "ADMIN" ? "ADMIN" : "OWNER"}
              </span>
            )}
          </div>
          <button className="btn sm block" onClick={logout}>Sign out</button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-title"><div className="topbar-eyebrow">MT5 MONITOR</div><h1>{pathname === "/dashboard" ? "Portfolio overview" : titleFor(pathname)}</h1></div>
          <span className="spacer" />
          {me?.user.role === "VIEWER" && (
            <span
              className="conn-pill"
              style={{
                borderColor: "rgba(148, 163, 184, 0.4)",
                color: "#94a3b8",
                background: "rgba(148, 163, 184, 0.1)",
              }}
              title="You have read-only access. Account modifications and configuration changes are restricted."
            >
              👁 VIEWER (READ-ONLY)
            </span>
          )}
          <button className="btn sm ghost hide-mobile" onClick={enableNotifications} title="Enable browser/desktop notifications">
            🔔
          </button>
          <span className={`conn-pill ${connClass}`} title="Realtime transport status">
            <span className="conn-dot" /> {connLabel}
          </span>
          <Link href="/alerts" className="header-action" aria-label={`Alerts, ${unack} unread`}>
            <ThemeIcon kind="alerts"/>{unack > 0 && <span className="alert-count">{unack}</span>}
          </Link>
          <button className="header-action" onClick={logout} aria-label="Lock dashboard and sign out" title="Sign out"><ThemeIcon kind="lock"/></button>
        </header>
        <main className="content">{children}</main>
      </div>

      <nav className="bottomnav">
        {NAV_ITEMS.filter((i) =>
          ["/dashboard", "/accounts", "/positions", "/alerts"].includes(i.href)
        ).map((item) => (
          <Link key={item.href} href={item.href} className={pathname.startsWith(item.href) ? "active" : ""}>
            <span className="bicon"><ThemeIcon kind={item.href.slice(1)}/></span>
            {item.href === "/dashboard" ? "Home" : item.label}
            {item.href === "/alerts" && unack > 0 && <span className="alert-count">{unack}</span>}
          </Link>
        ))}
        <a
          href="#more"
          className={MOBILE_NAV.some((m) => pathname.startsWith(m.href)) ? "" : "active"}
          onClick={(e) => {
            e.preventDefault();
            setMoreOpen(true);
          }}
        >
          <span className="bicon"><ThemeIcon kind="more"/></span>
          More
        </a>
      </nav>

      {moreOpen && (
        <div className="modal-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>More</h3>
            <div className="sub">Navigate the fleet</div>
            <div className="grid cols-2">
              {NAV_ITEMS.filter((n) => !MOBILE_NAV.some((m) => m.href === n.href)).map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="chip"
                  style={{ justifyContent: "center" }}
                  onClick={() => setMoreOpen(false)}
                >
                  {n.icon} {n.label}
                </Link>
              ))}
            </div>
            <div className="actions">
              <button className="btn" onClick={() => setMoreOpen(false)}>Close</button>
              <button className="btn danger" onClick={logout}>Sign out</button>
            </div>
          </div>
        </div>
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.severity}`}>
            <div className="t-title">{t.severity}</div>
            {t.body}
          </div>
        ))}
      </div>
    </div>
    </UserProvider>
  );
}

