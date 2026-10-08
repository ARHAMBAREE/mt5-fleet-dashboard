"use client";

/**
 * Realtime client with transport negotiation and full resync semantics.
 *
 *   WebSocket (if NEXT_PUBLIC_WS_URL configured / self-hosted)
 *     → Server-Sent Events (/api/realtime/stream, Vercel-friendly)
 *     → REST polling (/api/realtime/poll)
 *
 * Guarantees:
 *  • exponential backoff + jitter on every reconnect
 *  • re-authentication implicit (cookie) + explicit resync via /api/realtime/state
 *  • duplicate message protection (id dedupe window)
 *  • dashboard keeps working on REST alone if realtime is unavailable
 */

export type RealtimeStatus = "connecting" | "live" | "poll" | "retry" | "offline";

export interface RtEvent {
  id: string;
  type: string;
  data?: unknown;
  ts: number;
}

type Listener = (e: RtEvent) => void;
type StatusListener = (s: RealtimeStatus) => void;

const MAX_SEEN = 300;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

class RealtimeClient {
  private eventTarget = new EventTarget();
  private statusTarget = new EventTarget();
  private status: RealtimeStatus = "offline";
  private es: EventSource | null = null;
  private ws: WebSocket | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private attempt = 0;
  private cursor: string | null = null;
  private seen = new Set<string>();
  private seenOrder: string[] = [];
  private started = false;
  private stopped = false;
  private sseFailures = 0;
  private wsFailures = 0;
  private wsPing: ReturnType<typeof setInterval> | null = null;

  // ---- public API ----
  start(): void {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    this.stopped = false;
    this.connectPriority();
  }

  stop(): void {
    this.stopped = true;
    this.started = false;
    this.cursor = null;
    this.seen.clear();
    this.seenOrder = [];
    try { sessionStorage.removeItem("mt5fleet.cursor"); } catch {}
    this.teardown();
    this.setStatus("offline");
  }

  on(handler: Listener): () => void {
    const fn = (ev: Event) => handler((ev as CustomEvent).detail as RtEvent);
    this.eventTarget.addEventListener("evt", fn);
    return () => this.eventTarget.removeEventListener("evt", fn);
  }

  onStatus(handler: StatusListener): () => void {
    const fn = (ev: Event) => handler((ev as CustomEvent).detail as RealtimeStatus);
    this.eventTarget.addEventListener("status", fn);
    return () => this.eventTarget.removeEventListener("status", fn);
  }

  getCursor(): string | null {
    return this.cursor;
  }

  // ---- internals ----
  private setStatus(s: RealtimeStatus) {
    if (this.status === s) return;
    this.status = s;
    this.statusTarget.dispatchEvent(new CustomEvent("status", { detail: s }));
    // bridge status into evt channel so useRealtimeStatus works with one target
    this.eventTarget.dispatchEvent(new CustomEvent("status", { detail: s }));
  }

  private emit(e: RtEvent) {
    if (e.id) {
      if (this.seen.has(e.id)) return; // duplicate protection
      this.seen.add(e.id);
      this.seenOrder.push(e.id);
      if (this.seenOrder.length > MAX_SEEN) {
        const old = this.seenOrder.shift();
        if (old) this.seen.delete(old);
      }
      this.cursor = e.id;
      try {
        sessionStorage.setItem("mt5fleet.cursor", e.id);
      } catch { /* private mode */ }
    }
    this.eventTarget.dispatchEvent(new CustomEvent("evt", { detail: e }));
  }

  private backoff(): number {
    const exp = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** this.attempt);
    this.attempt += 1;
    return exp + Math.random() * 1000;
  }

  private scheduleRetry(): void {
    if (this.stopped) return;
    this.setStatus("retry");
    const delay = this.backoff();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connectPriority(), delay);
  }

  private teardown() {
    if (this.es) { this.es.close(); this.es = null; }
    if (this.ws) { this.ws.onclose = null; this.ws.close(); this.ws = null; }
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.wsPing) { clearInterval(this.wsPing); this.wsPing = null; }
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
  }

  private connectPriority() {
    if (this.stopped) return;
    this.teardown();
    try {
      this.cursor = this.cursor ?? sessionStorage.getItem("mt5fleet.cursor");
    } catch { /* ignore */ }

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/ws`;
    if (wsUrl && this.wsFailures < 3) {
      this.connectWs(wsUrl);
      return;
    }
    if (this.sseFailures < 4) {
      this.connectSse();
      return;
    }
    this.connectPoll();
  }

  private async resync() {
    try {
      const res = await fetch("/api/realtime/state", { credentials: "include" });
      if (res.ok) {
        const j = (await res.json()) as { cursor: string | null };
        if (j.cursor && this.cursor === null) this.cursor = j.cursor;
      }
    } catch { /* offline */ }
    this.emit({ id: "", type: "__resync__", ts: Date.now() });
  }

  private connectWs(url: string) {
    this.setStatus("connecting");
    let opened = false;
    let lastMessage = Date.now();
    try {
      const proto = url.startsWith("wss") ? "wss" : "ws";
      const target = url.startsWith("ws") ? url : `${proto}://${url}${url.startsWith(location.host) ? "" : ""}`;
      const ws = new WebSocket(target);
      this.ws = ws;

      const openTimeout = setTimeout(() => {
        if (!opened) { try { ws.close(); } catch { /* noop */ } }
      }, 8000);

      ws.onopen = () => {
        opened = true;
        clearTimeout(openTimeout);
        this.attempt = 0;
        this.setStatus("live");
        ws.send(JSON.stringify({ type: "hello", cursor: this.cursor }));
        void this.resync();
        this.wsPing = setInterval(() => {
          if (Date.now() - lastMessage > 45_000) { ws.close(); return; }
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
        }, 25_000);
      };

      ws.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(String(msg.data)) as { id?: string; type?: string; data?: unknown; ts?: number };
          lastMessage = Date.now();
          if (parsed.type === "pong" || parsed.type === "hello") return;
          this.emit({ id: parsed.id ?? "", type: parsed.type ?? "message", data: parsed.data, ts: parsed.ts ?? Date.now() });
        } catch { /* ignore malformed */ }
      };

      ws.onerror = () => { /* onclose follows */ };

      ws.onclose = () => {
        clearTimeout(openTimeout);
        if (this.wsPing) { clearInterval(this.wsPing); this.wsPing = null; }
        this.ws = null;
        if (this.stopped) return;
        this.wsFailures += 1;
        if (this.wsFailures >= 3) {
          this.sseFailures = 0; // give SSE a clean chance
          this.connectSse();
          return;
        }
        this.scheduleRetry();
      };
    } catch {
      this.wsFailures += 1;
      this.connectSse();
    }
  }

  private connectSse() {
    this.setStatus("connecting");
    try {
      const url = `/api/realtime/stream${this.cursor && /^\d+$/.test(this.cursor) ? `?after=${this.cursor}` : ""}`;
      const es = new EventSource(url, { withCredentials: true });
      this.es = es;

      es.onopen = () => {
        this.attempt = 0;
        this.sseFailures = 0;
        this.setStatus("live");
        void this.resync();
      };
      es.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(msg.data) as { type?: string; data?: unknown; ts?: number; cursor?: string };
          const id = msg.lastEventId || "";
          if (parsed.type === "hello" || parsed.type === "bye" || parsed.type === "ping") return;
          this.emit({ id, type: parsed.type ?? "message", data: parsed.data, ts: parsed.ts ?? Date.now() });
        } catch { /* ignore */ }
      };
      es.onerror = () => {
        es.close();
        if (this.stopped) return;
        this.es = null;
        this.sseFailures += 1;
        if (this.sseFailures >= 4) this.connectPoll();
        else this.scheduleRetry();
      };
    } catch {
      this.sseFailures += 1;
      if (this.sseFailures >= 4) this.connectPoll();
      else this.scheduleRetry();
    }
  }

  private connectPoll() {
    this.setStatus("poll");
    void this.resync();
    const tick = async () => {
      if (this.stopped) return;
      try {
        const res = await fetch(`/api/realtime/poll?after=${this.cursor ?? ""}`, { credentials: "include" });
        if (res.status === 401) { this.setStatus("offline"); return; }
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as { cursor: string | null; events: { id: string; type: string; data: unknown; ts: number }[] };
        if (j.cursor) this.cursor = j.cursor;
        for (const e of j.events) this.emit(e);
        this.attempt = 0;
        this.setStatus("poll");
      } catch {
        this.attempt += 1;
        this.setStatus(this.attempt > 3 ? "offline" : "retry");
      }
    };
    void tick();
    this.pollTimer = setInterval(() => {
      void tick();
      // Opportunistically re-try richer transports after some time in poll mode.
      if (this.attempt === 0 && Math.random() < 0.05) { this.wsFailures = 0; this.sseFailures = 0; this.connectPriority(); }
    }, 5000);
  }
}

export const realtime = typeof window !== "undefined" ? new RealtimeClient() : (null as unknown as RealtimeClient);
