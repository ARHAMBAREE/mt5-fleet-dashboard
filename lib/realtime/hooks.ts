"use client";

import { useEffect, useRef, useState } from "react";
import { realtime, type RealtimeStatus, type RtEvent } from "@/lib/realtime/client";

/** Subscribe to realtime events (auto-starts the transport once). */
export function useRealtimeEvents(handler: (e: RtEvent) => void): void {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!realtime) return;
    realtime.start();
    const off = realtime.on((e) => ref.current(e));
    return off;
  }, []);
}

export function useRealtimeStatus(): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  useEffect(() => {
    if (!realtime) return;
    realtime.start();
    const off = realtime.onStatus(setStatus);
    return off;
  }, []);
  return status;
}

/**
 * Debounced refetch bound to realtime invalidation events.
 * `types` limits which event types trigger a refresh.
 */
export function useLiveRefresh(refetch: () => void, types: string[] = ["accounts:update", "heartbeat", "__resync__"], delayMs = 800): void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fn = useRef(refetch);
  fn.current = refetch;

  useRealtimeEvents((e) => {
    if (!types.includes(e.type)) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fn.current(), delayMs);
  });

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
}
