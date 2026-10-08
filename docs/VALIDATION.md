# Validation — 8 October 2026

Passed:

- Production Next.js build on Node **24.21.0**.
- Strict web/API TypeScript check and Electron TypeScript compilation.
- Six unit tests for heartbeat boundaries, drawdown, exposure, reporting periods, protocol validation and CSV formula handling.
- Real temporary PostgreSQL integration suite on Node 24: initial migration, signup/login/logout, session revocation, CSRF, concurrent one-use pairing, account binding, telemetry, 64-bit tickets/magic, removed history endpoints/storage, cross-user isolation, WebSocket event replay/ping, mixed-currency totals, lifetime drawdown, exports, retention and agent revocation.
- MT5FleetAgent.mq5 compiled with the installed MetaEditor: **0 errors, 0 warnings**. Generated binary: `mt5-agent/MT5FleetAgent.ex5`. The compile used an isolated Wine profile and compiler copy, never an attached trading chart.
- Local PostgreSQL startup/migration and rendered browser login screen.

Not yet verified:

- Actual MT5 → public HTTPS telemetry, because no hosted database/domain/Vercel project is configured. No live trading terminal was modified or paired.
- Vercel-hosted WebSocket upgrade (the shared connection handler was exercised locally).
- Windows installer: packaging reached the Electron runtime download and failed after its 600-second request timeout. No completed Windows installer is claimed. Use the included Windows CI packaging workflow or rerun `npm run package:win` on a network that can download GitHub release assets.
- macOS/Linux installers, signing/notarization, native notification/tray/startup/update flows and mobile device testing.
- 500-terminal load/soak performance.

Dependency audit after compatible patches: **0 critical, 0 high, 8 moderate** advisories, all through the desktop build tool chain's `sprintf-js` dependency (no newer fixed sprintf-js release was available in the registry). Review before commercial distribution. Dependency overrides and the lockfile are checked by builds/tests.

No sample trading accounts or telemetry were inserted into the local dashboard. Test fixtures live only in the disposable integration-test database. The local administrator was created at the user's explicit request; credentials are in `.local/dashboard-login.json` (ignored, mode 0600), never source code or public assets.
