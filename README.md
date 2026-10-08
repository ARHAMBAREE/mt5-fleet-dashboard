# MT5 Fleet Dashboard

A Next.js dashboard, Electron desktop client, and read-only MQL5 telemetry agent sharing one API and PostgreSQL database. No broker passwords, investor passwords, broker API keys, trading functions, or demo accounts.

## Run locally

Use **Node.js 24 LTS** (`nvm use`) and install dependencies:

```sh
npm install
npm run dev:local
```

`dev:local` creates an actual, persistent **development-only PostgreSQL** cluster in `.local/`, generates private local secrets in `.env`, applies migrations, and starts Next.js at **http://localhost:3000**. Create your dashboard login. There are no accounts until you pair a terminal. Ctrl+C stops both services; restarting preserves your local data. This command refuses to overwrite an existing `.env` when setting up the cluster.

If you already have PostgreSQL:

```sh
cp .env.example .env
# Fill in DATABASE_URL, DIRECT_URL, AUTH_SECRET, AGENT_SECRET, CRON_SECRET.
# APP_URL and NEXT_PUBLIC_APP_URL = http://localhost:3000 for local development.
npm run db:migrate
npm run dev
```

Generate each secret independently with `openssl rand -base64 48`. Do not commit `.env` or `.local`. The EA requires HTTPS: pair against your deployed application or a trusted HTTPS development endpoint, not plain localhost.

## Create PostgreSQL and deploy on Vercel

1. Create a persistent PostgreSQL database through your preferred provider or the Vercel Marketplace. Place it near the Vercel function region (`iad1` by default); edit `vercel.json` for another region.
2. Create/import a Vercel project with this directory as its root, framework **Next.js**, Node.js **24.x**, and **Fluid Compute enabled**.
3. Configure these variables for the production environment:

| Variable | Value | Public? |
| --- | --- | --- |
| `DATABASE_URL` | Provider's TLS PostgreSQL URL, preferably a connection pool endpoint | No |
| `DIRECT_URL` | Migration connection; Supabase session pooler on port 5432. For local PostgreSQL, use DATABASE_URL’s value | No |
| `AUTH_SECRET` | Independent random 48-byte secret for session signing | No |
| `AGENT_SECRET` | Independent random 48-byte secret for pairing HMAC | No |
| `CRON_SECRET` | Independent random secret for maintenance authorization | No |
| `APP_URL` | Canonical HTTPS origin, without path/trailing slash | No secret, server configuration |
| `NEXT_PUBLIC_APP_URL` | The same HTTPS origin | Yes |

4. The build command runs **Prisma migrations before building**, using `DIRECT_URL`. Keep the transaction pooler `DATABASE_URL` for runtime; Supabase uses ports 5432 and 6543 respectively. Configure both variables in Vercel. Do not share a production database with untrusted preview deployments.
5. Deploy using `npx vercel` or `npx vercel --prod`, or connect a Git repository in Vercel. This folder was not originally a Git checkout; initialize/push a private repository if you want automatic Git deployments.
6. Add your custom domain under Project → Settings → Domains and follow Vercel's DNS instructions. Set both app URL variables to that origin and redeploy. The EA, browser, and desktop must all use that same origin.
7. `vercel.json` schedules maintenance every five minutes. **This schedule requires a plan that supports frequent cron jobs**. On a restricted plan, change it to the supported frequency and accept delayed background offline alerts/retention, or use an authenticated external scheduler.
8. Exempt agent endpoints from interactive Vercel Deployment Protection on the production domain so MT5 can reach them. App-level agent credentials remain required.

The app is not deployed by building it locally. You must create and configure your Vercel/database accounts before it is publicly available. See [deployment details](docs/deployment.md).

## Desktop application

For development, run the web app first, then:

```sh
npm run electron:dev
```

The production desktop client loads the hosted HTTPS UI. It **does not start a backend or localhost server**. A persistent Electron session remembers login. The main process disables Node in the renderer, isolates the preload, restricts navigation and IPC, and handles native notifications, tray behavior, startup and updates.

To build installers:

```sh
npm run build
npm run package:win
npm run package:mac
npm run package:linux
```

Artifacts are written to `release/`. Set `ELECTRON_APP_URL=https://your-domain` before packaging to preconfigure your domain, or leave it unset for the first-run URL setup screen. Desktop recipients do not need Node, npm, Python, VS Code, or a separate browser.

**Windows first:** run `package:win` on Windows (or use the included manual GitHub Actions desktop build). It produces an NSIS setup executable with Start Menu and desktop shortcuts. macOS produces DMG/ZIP; Linux produces AppImage/DEB. Build on the target OS for reliable native packaging and signing. Windows signing certificates and Apple signing/notarization credentials are operator-provided; an unsigned development package is not a signed commercial release.

Install the setup executable/DMG/AppImage, enter your hosted domain if requested, and log in with the same account as the browser. Closing/minimizing hides to tray by default; choose Quit from the tray to exit. Startup control is supported on Windows/macOS; Linux startup is managed by the desktop environment.

For optional updates set `APP_UPDATE_URL` to a public HTTPS generic update feed **at package time**. Publish signed artifacts and electron-builder update metadata to that feed. Update checks prompt before downloading and before restarting; development builds never auto-update. See [desktop/release operations](docs/deployment.md).

## Compile and install the MT5 EA

1. Copy `mt5-agent/MT5FleetAgent.mq5` into the terminal's **File → Open Data Folder → MQL5 → Experts** folder, or download it from Dashboard → Agents.
2. Open it in **MetaEditor**, press **F7 / Compile**, and check for errors. The resulting `.ex5` belongs beside the source. MQL5 compilation requires MetaEditor; `npm run build` does not compile it.
3. MT5 → **Tools → Options → Expert Advisors → Allow WebRequest for listed URL**. Add the exact origin, for example `https://mt5dashboard.example.com`.
4. Dashboard → **Settings → MT5 Agents → Add Agent**. Copy the one-use pairing code (expires after 15 minutes by default).
5. Attach `MT5FleetAgent` to a **separate chart**. Set `ServerURL` to the HTTPS origin and `PairingCode` to the code. No broker credentials are requested. Do not replace a trading EA on its existing chart.
6. The agent pairs, writes its dashboard credential into a private terminal `MQL5/Files/MT5Fleet-*.dat` file, and reports account data. Keep this file private and out of backups shared with others. MT5 terminal global variables cannot safely store string credentials, so they are not used.
7. Check the chart's connection status and Dashboard → Agents. Revoke an installation from that page when it should no longer transmit.
8. Repeat with a **new pairing code in every terminal**. A terminal account/server change loads its own local state and requires its own pairing. Do not copy a paired credential file between terminals.

Defaults: heartbeat and snapshot every five seconds; timer-based networking; changed position/order sets only. Positions/orders reconcile transactionally. Trade history is not uploaded or stored. See [protocol and accounting semantics](docs/agent-protocol.md).

## Use the dashboard

- **Dashboard / Accounts:** sortable account table, persistent column choices, current health, balances, equity, floating P/L. USD and USC accounts are displayed together in USD (USC amounts kept unchanged), including account balances, equity, floating P/L, charts and rankings. Original account currency remains labeled and broker-native values stay stored unchanged. Selecting USD includes USC accounts. Unrelated currencies remain separate; no FX rates are invented.
- **Account detail:** overview, equity/balance/drawdown curves, positions, orders, risk and agent health. Lifetime sampled equity peak and maximum drawdown survive snapshot retention.
- **Groups:** system LIVE/DEMO membership follows telemetry; ALL is virtual. Custom groups support multiple memberships per account.
- **Analytics:** filter by group, broker, mode, server, agent, account, currency and currently open symbol. Equity buckets use the last known sample per account, carried forward, rather than summing all observations in a bucket.
- **Alerts:** enable/tune the provided rules or create custom rules. Defaults are disabled until reviewed. Browser notifications require permission; Settings controls browser/desktop delivery. In-app toasts remain visible. Alerts are delivered while a dashboard/desktop session is open; this is not a mobile push service.
- **Exports:** CSV and JSON via the export actions or `/api/export?type=accounts&format=json`; other types are positions, orders and analytics. Exports are ownership-scoped. CSV escapes spreadsheet formulas.
- **Mobile:** bottom navigation for Dashboard, Accounts, Positions, Alerts and More; tables scroll horizontally with configurable columns.
- **Retention:** 7/30/90 days, 1 year, or Unlimited, applied only to historical account/equity snapshots. Current state and alerts are preserved.

## Realtime and offline behavior

The Vercel `/api/ws` endpoint uses `@vercel/functions`' documented **beta** WebSocket upgrade API. Connections authenticate against PostgreSQL sessions, check origin, ping, expire/reconnect before the function timeout, and replay durable event IDs. No connection-local data is the source of truth. SSE and five-second REST page refreshes keep monitoring available if WebSockets are unavailable. `next dev` uses the fallback; `npx vercel dev` with a compatible Vercel CLI can exercise the Vercel upgrade API. `npm run dev:full` offers a separate **development** WebSocket process at port 3001; set `NEXT_PUBLIC_WS_URL=ws://localhost:3001/api/ws` for that mode.

Health uses the latest heartbeat: under 10s ONLINE, 10–29s WARNING, 30s+ OFFLINE. A terminal that reports disconnected is OFFLINE. Accounts are never removed when offline. With a live dashboard, alert checks run every ten seconds; without one, background alerts follow the cron cadence. Retention and infrastructure cleanup also follow cron cadence.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Login/API error | PostgreSQL reachable, migration applied, `AUTH_SECRET` configured; inspect server logs |
| Pairing rejected | New unused/unexpired code; correct server URL; pairing response lost may require a new code |
| `WebRequest` / network error | Exact HTTPS origin allowlisted; certificate valid; terminal online; Experts/Journal error code; not Strategy Tester |
| Offline account | MT5/EA still running, timer chart attached, URL unchanged, credential not revoked, network reachable |
| Revoked credential | Generate a new code and reattach/reconfigure the EA; revoked credentials cannot be restored |
| Duplicate/incorrect account | Login **and broker server** identify an account; credentials must not be copied to other terminals |
| Incorrect historical day | Broker server UTC offset / DST; configure `BrokerUTCOffsetMinutes` appropriately |
| Desktop offline | Hosted domain reachable in browser; DNS/TLS valid; tray app has network access |
| No native notification | Rule enabled, threshold met, Settings enabled, OS/browser notification permission granted |
| WebSocket reconnects | Expected at function timeout; inspect SSE/poll fallback before treating it as outage |
| Local database port busy | Stop the other `dev:local` process; local DB uses 15433, tests use 15432 |

## Validation and operating limits

```sh
npm run typecheck
npm test
npm run build
npm run test:integration
npm run electron:compile
```

Integration tests start an isolated temporary PostgreSQL cluster and a production Next server; no test accounts enter your real database. They validate migrations, auth, CSRF, concurrent pairing, telemetry, 64-bit identifiers, disabled history endpoints/storage, ownership, analytics, retention and revocation. Build before running them.

The database schema and batched account queries support large fleets, but **500+ live terminals have not been load-tested**. At 500 terminals, two five-second reports already mean roughly 200 requests/second before position/order traffic; size your Vercel plan, PostgreSQL pool, retention and storage accordingly. See [architecture and limits](docs/architecture.md). This is monitoring software; a real terminal soak test must be validated before operational use. Desktop installers require platform smoke tests, and the EA requires MetaEditor/live-terminal verification.

Current verification results and remaining release gates: [validation report](docs/VALIDATION.md).

Additional documentation: [architecture/database diagrams](docs/architecture.md), [API](docs/api.md), [agent protocol](docs/agent-protocol.md), [security](docs/security.md), [deployment](docs/deployment.md).

Trade history was removed to reduce ingestion, queries and storage. Migration `202610080002_remove_trade_history` drops existing deal records and disables daily-loss rules. Daily/weekly/monthly realized P/L, trade statistics and history exports are unavailable; rankings use current floating P/L. Update installed EAs to version 1.01 so they stop attempting history uploads. Live telemetry and equity snapshots still consume resources; this change does not guarantee staying within a hosting plan’s limits.

The dashboard gold grid chart shows shared TP levels for open XAUUSD/GOLD positions across all accounts. Grids are grouped by account, exact symbol, EA magic number and direction. Different or missing position TPs are flagged; virtual basket targets cannot be inferred without telemetry from the trading EA. Prices remain instrument prices, independent of account currency. No price history is collected.
