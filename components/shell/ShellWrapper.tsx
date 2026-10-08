"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtimeEvents, useRealtimeStatus } from "@/lib/realtime/hooks";
import { apiGet, apiSend, ApiClientError } from "@/lib/client/api";

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
  user: { id: string; email: string; name: string; role: string };
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
              <span className="icon">{item.icon}</span>
              {item.label}
              {item.href === "/alerts" && unack > 0 && <span className="nav-badge">{unack}</span>}
            </Link>
          ))}
          <span className="nav-label">System</span>
          {NAV_ITEMS.slice(7).map((item) => (
            <Link key={item.href} href={item.href} className={`nav-item ${pathname.startsWith(item.href) ? "active" : ""}`}>
              <span className="icon">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)", fontSize: 12 }}>
          <div className="muted" style={{ marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis" }}>
            {me?.user.email ?? "…"}
          </div>
          <button className="btn sm block" onClick={logout}>Sign out</button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <h1>{titleFor(pathname)}</h1>
          <span className="spacer" />
          <button className="btn sm ghost hide-mobile" onClick={enableNotifications} title="Enable browser/desktop notifications">
            🔔
          </button>
          <span className={`conn-pill ${connClass}`} title="Realtime transport status">
            <span className="conn-dot" /> {connLabel}
          </span>
          <Link href="/alerts" className="btn sm" title="Unacknowledged alerts">
            ⚠ {unack}
          </Link>
        </header>
        <main className="content">{children}</main>
      </div>

      <nav className="bottomnav">
        {NAV_ITEMS.filter((i) =>
          ["/dashboard", "/accounts", "/positions", "/alerts"].includes(i.href)
        ).map((item) => (
          <Link key={item.href} href={item.href} className={pathname.startsWith(item.href) ? "active" : ""}>
            <span className="bicon">{item.icon}</span>
            {item.label}
            {item.href === "/alerts" && unack > 0 && <span className="dot" />}
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
          <span className="bicon">•••</span>
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
  );
}

