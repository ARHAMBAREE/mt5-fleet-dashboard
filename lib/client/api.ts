/**
 * Browser API client — same-origin on the web, and on Electron the hosted
 * origin is loaded directly, so relative URLs work everywhere. CSRF token is
 * attached for mutations from the double-submit cookie.
 */

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function buildQuery(params?: Record<string, string | number | boolean | undefined | null>): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const obj = json as { error?: string; code?: string } | null;
    throw new ApiClientError(res.status, obj?.code ?? "ERROR", obj?.error ?? `Request failed (${res.status})`);
  }
  return json as T;
}

export async function apiGet<T>(path: string, params?: Record<string, string | number | boolean | undefined | null>): Promise<T> {
  const res = await fetch(`${path}${buildQuery(params)}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  return parse<T>(res);
}

export async function apiSend<T>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const csrf = readCookie("mt5fleet_csrf");
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parse<T>(res);
}

/** Trigger a file download for an authenticated export endpoint. */
export function apiDownload(path: string, params?: Record<string, string | undefined>): void {
  const url = `${path}${buildQuery(params)}`;
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
