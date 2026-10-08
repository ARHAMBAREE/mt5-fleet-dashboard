import "server-only";
/**
 * Centralised, server-side environment access.
 * Secrets are read from process.env only — never bundled into client code
 * (this module must never be imported from a "use client" component).
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    if (process.env.NEXT_PHASE === "phase-production-build") return "";
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in (on Vercel: Project → Settings → Environment Variables).`
    );
  }
  return v;
}

export const env = {
  get DATABASE_URL() {
    return required("DATABASE_URL");
  },
  get AUTH_SECRET() {
    return required("AUTH_SECRET");
  },
  get AGENT_SECRET() {
    return required("AGENT_SECRET");
  },
  get APP_URL() {
    return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  },
  get NEXT_PUBLIC_APP_URL() {
    return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  },
  get WS_URL() {
    return process.env.WS_URL || "";
  },
  get PAIRING_TTL_MINUTES() {
    const n = Number(process.env.PAIRING_TTL_MINUTES);
    return Number.isFinite(n) && n > 0 ? n : 15;
  },
  get HEARTBEAT_SECONDS() {
    const n = Number(process.env.AGENT_HEARTBEAT_SECONDS);
    return Number.isFinite(n) && n > 0 ? n : 5;
  },
  get SNAPSHOT_SECONDS() {
    const n = Number(process.env.AGENT_SNAPSHOT_SECONDS);
    return Number.isFinite(n) && n > 0 ? n : 5;
  },
  get isDev() {
    return process.env.NODE_ENV !== "production";
  },
};

/** Origins allowed to call the API with credentials (CORS allow-list). */
export function allowedOrigins(): string[] {
  const set = new Set<string>([env.APP_URL, env.NEXT_PUBLIC_APP_URL]);
  if (env.isDev) {
    set.add("http://localhost:3000");
    set.add("http://127.0.0.1:3000");
  }
  const extra = process.env.ALLOWED_ORIGINS;
  if (extra) extra.split(",").forEach((o) => o.trim() && set.add(o.trim().replace(/\/+$/, "")));
  return [...set].filter(Boolean);
}
