# Deployment and releases

## Web

Use Node 24 LTS, external PostgreSQL and Prisma migrations. `npm run build` generates the Prisma client and optimizes Next.js; `npm run build:vercel` also applies checked-in migrations. The initial migration creates all tables, indexes, foreign keys and PostgreSQL enums. Do not use `db push` to manage production schema evolution.

Configure Vercel's production variables from README and use a separately isolated database/secrets for preview deployments. Region should match your database. A custom domain is optional initially: your project's `*.vercel.app` production domain works for web, Electron and the EA. Update APP_URL/NEXT_PUBLIC_APP_URL when switching canonical domains. Agent endpoints must be reachable without an interactive Vercel protection challenge.

Fluid Compute WebSockets use the documented experimental API and are disposable. Vercel stops connections at function duration; client reconnect/resync is expected. SSE and REST refresh remain available. Sources: [Vercel WebSockets](https://vercel.com/docs/functions/websockets), [upgrade API and local development](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#experimental_upgradewebsocket), [Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

Cron calls `/api/cron/maintenance` with `CRON_SECRET`. The included five-minute schedule requires a compatible plan. [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) determine available frequency. A less frequent schedule increases background alert/cleanup delay; foreground liveness still derives from timestamps on every refresh. Do not expose an unauthenticated maintenance endpoint to work around cron setup.

Verify after deployment:

1. Create/login/logout; ensure a revoked session cannot access `/api/auth/me`.
2. Generate a pairing code and pair a demo terminal using the final HTTPS domain.
3. Observe heartbeat, snapshot, position and order updates; remove/restore network and verify resync.
4. Enable a safe test threshold; verify alert recording and browser/desktop delivery.
5. Inspect Vercel cron logs and database storage, latency and connection usage.
6. Run a representative fleet load test before ramping to hundreds of terminals.

## Desktop

Run packaging on the target operating system. `electron-builder.yml` configures NSIS, DMG/ZIP and AppImage/DEB. The manual GitHub Actions workflow builds all three when triggered; this is a build workflow, not automatic public publication. It requires a GitHub repository to run.

Set `ELECTRON_APP_URL` at build time to preconfigure the hosted origin. Without it, recipients use the first-run URL setup screen. Generated `electron/assets/config.json` has public URLs only and is excluded from source control. Persistent per-user local settings and session cookies live in Electron's standard `userData` location.

For signing, provide electron-builder's documented certificate environment variables in CI (`CSC_LINK`, `CSC_KEY_PASSWORD`, platform-specific signing/notarization credentials). Store these as CI secrets; do not add certificates to source. Validate Windows installation, shortcuts, tray, notifications, login persistence, reboot/startup and uninstall. On macOS validate Gatekeeper/notarization; on Linux validate supported distro dependencies. A successful TypeScript compile does not replace these checks.

For auto-updates:

1. Choose a public HTTPS generic feed and set `APP_UPDATE_URL` before packaging.
2. Increment `package.json` version for each release.
3. Build signed installers with a matching electron-builder `publish` generic configuration to generate update metadata (via CLI/config override for your feed).
4. Upload installers, blockmaps and `latest.yml` / `latest-mac.yml` / `latest-linux.yml` produced by builder to the feed.
5. Test upgrade from the previous signed version using Settings → Check for updates. Downloads and installation require user choice. The app does not auto-download during development.

Update hosting and signing identities are intentionally not hard-coded: they belong to the operator's infrastructure.
