# Security design

Passwords use bcrypt; session JWTs use HS256 and a random per-session identifier. PostgreSQL stores the hash of the exact JWT and enforces expiry/revocation, so logout invalidates replay of old cookies. Cookies are HttpOnly/SameSite=Lax and Secure on HTTPS. Browser mutations require a double-submit CSRF token bound to the JWT with an HMAC. Login/registration, API reads/writes, pairing and telemetry have PostgreSQL-backed rate limits that fail closed on database failure.

Agent credentials are generated server-side, hashed with SHA-256 at rest, and compared in constant time. Pairing codes are random, expire, and are atomically consumed. Pairing hashes use the independent `AGENT_SECRET`. Revoking an agent prevents further authenticated requests; persisted account history remains. Treat terminal credential files as secrets and revoke lost installations.

Routes enforce ownership for account/group/alert/agent identifiers and the OWNER/ADMIN/VIEWER role hierarchy. New users own separate fleets; no account data is shared across registrations. Requests use Zod validation, finite numerical fields, bounded collections, bounded bodies and Prisma parameter binding. React renders free text safely; exported CSV strings neutralize formula prefixes. Browser origins are allowlisted; same-origin web and desktop are the supported deployment topology.

Electron uses sandboxed renderers, context isolation, no renderer Node integration, no webviews, origin/frame-validated IPC, and a narrow preload interface. Arbitrary navigation/redirects are blocked. Export downloads use the authenticated Electron session. Only HTTP(S) links can open externally. Update feeds must be HTTPS; use signed release artifacts and protect your publishing credentials.

`AUTH_SECRET`, `AGENT_SECRET`, `CRON_SECRET`, and `DATABASE_URL` never belong in `NEXT_PUBLIC_*` variables. `.env`, `.local`, generated desktop configuration, build outputs and release files are ignored by Git. The desktop configuration contains only a public origin/update URL. Logs do not intentionally print passwords or agent credentials.

Maintenance requires the secret bearer token, never a caller-controlled cron header. Active streams recheck session validity. Server memory may hold connection cursors or a Prisma connection pool, but not authoritative authentication/account/event state.

## Operations

- Use managed TLS PostgreSQL, database backups/PITR, least-privilege runtime access, a migration-capable release identity, and a low per-instance pool limit.
- Configure a canonical HTTPS domain. Rotate session secrets to invalidate all sessions; rotate agent credentials by revoking/re-pairing. Changing the pairing HMAC secret invalidates outstanding codes.
- Review auth logs/rate limits, set Vercel usage alerts, and keep dependency lockfiles patched. Update signing and notarization are required operator steps for trusted commercial desktop releases.
- Authenticated telemetry is still untrusted account data. The service cannot cryptographically attest that a terminal has not been modified by its owner.
- This implementation does not provide MFA, password-reset email, organizational invitations, immutable financial audit ledgers, or mobile push while the app is closed. Plan those separately if required by your deployment.
