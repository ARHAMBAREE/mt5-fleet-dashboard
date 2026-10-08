import { ONLINE_WINDOW_MS, WARNING_WINDOW_MS, type EaStatusValue } from "@/shared/types";

/**
 * Derive connection status from heartbeat age at read time — never stored
 * as stale state, so recovery is instant and accounts are never deleted.
 *
 *   age < 10s            → ONLINE
 *   age < 30s            → WARNING
 *   age ≥ 30s or no beat → OFFLINE
 */
export function deriveEaStatus(lastHeartbeatAt: Date | string | null | undefined, now = Date.now()): EaStatusValue {
  if (!lastHeartbeatAt) return "OFFLINE";
  const t = lastHeartbeatAt instanceof Date ? lastHeartbeatAt.getTime() : Date.parse(lastHeartbeatAt);
  if (!Number.isFinite(t)) return "OFFLINE";
  const age = now - t;
  if (age < ONLINE_WINDOW_MS) return "ONLINE";
  if (age < WARNING_WINDOW_MS) return "WARNING";
  return "OFFLINE";
}

export function heartbeatAgeSec(lastHeartbeatAt: Date | string | null | undefined, now = Date.now()): number | null {
  if (!lastHeartbeatAt) return null;
  const t = lastHeartbeatAt instanceof Date ? lastHeartbeatAt.getTime() : Date.parse(lastHeartbeatAt);
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 1000)) : null;
}
