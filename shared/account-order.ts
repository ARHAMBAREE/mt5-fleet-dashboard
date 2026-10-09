/** Immutable identity fields keep account order stable across telemetry refreshes. */
export function compareAccountIdentity(
  a: { login: string; server: string; id: string },
  b: { login: string; server: string; id: string },
): number {
  return a.login.localeCompare(b.login, "en", { numeric: true })
    || a.server.localeCompare(b.server, "en")
    || a.id.localeCompare(b.id, "en");
}
