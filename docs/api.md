# HTTP API

Base: the same HTTPS origin as the dashboard. Node.js Next.js route handlers. JSON requests and responses. Errors: `{ "ok": false, "code": "VALIDATION", "error": "..." }` with appropriate HTTP status. Request bodies are limited to 2 MiB. Unsupported protocol versions fail validation.

## Browser / desktop

Login/register set `mt5fleet_session` (HttpOnly, SameSite=Lax, Secure on HTTPS) and `mt5fleet_csrf`. Every cookie-authenticated mutation must echo the CSRF cookie in `X-CSRF-Token`; the token is bound to the JWT with an HMAC. Requests are scoped to the session's user. Mutations normally require ADMIN or OWNER; reads allow VIEWER.

| Method | Route | Inputs / purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | `{email,password,name}`; create isolated fleet owner |
| POST | `/api/auth/login` | `{email,password}`; seven-day session |
| POST | `/api/auth/logout` | Revoke current DB session and clear cookies |
| GET | `/api/auth/me` | Session user and counters |
| GET | `/api/accounts` | `q,mode,groupId,broker,server,currency,agentId,accountId,symbol,status,sort,dir`; summaries/totals |
| GET | `/api/accounts/:id` | `range=24h|7d|30d|90d|1y`; detail, series, risk |
| GET | `/api/positions` | `accountId,symbol,type,q,page,pageSize` |
| GET | `/api/orders` | `accountId,symbol,q,page,pageSize` |
| GET | `/api/analytics` | Account filters + `range`; combined series and ranking |
| GET | `/api/groups` | Stored and virtual groups |
| POST | `/api/groups` | `{name,color}` |
| PUT | `/api/groups` | `{accountId,groupIds}`; replace memberships |
| DELETE | `/api/groups?id=...` | Delete owned non-system group |
| GET | `/api/agents` | Installations, health, masked pairing metadata |
| POST | `/api/agents` | `{label?}`; generate code returned once |
| PATCH | `/api/agents/:id` | `{name}` |
| DELETE | `/api/agents/:id` | Revoke credential; preserve account history |
| GET | `/api/alerts` | Rules and latest 100 events |
| POST | `/api/alerts` | `{name?,type,threshold,enabled,severity,accountId?,cooldownSeconds}` |
| PUT | `/api/alerts` | `{id,...ruleFields}` |
| DELETE | `/api/alerts?id=...` | Delete rule |
| GET / POST | `/api/alerts/events` | List (`after` epoch milliseconds) / acknowledge `{id}` or `{all:true}` |
| GET | `/api/settings` | User settings/defaults |
| PUT | `/api/settings` | `{key,value}`; retention/notifications/desktop/display/thresholds |
| GET | `/api/export` | `type=accounts|positions|orders|analytics`, `format=csv|json`, `accountId?,from?,to?` |

Pagination defaults to 100 rows and permits up to 500. Times are ISO dates in REST responses. Monetary amounts are in each account's currency. Mixed-currency account/analytics monetary totals are `null`; clients must select a currency. Symbol analytics filters accounts with a matching currently open position, not historical symbol attribution.

## Realtime

- `/api/ws`: same-origin WebSocket upgrade, session authenticated and origin-checked. Send `{type:"hello",cursor:"123"}` after open; send `{type:"ping"}` at least every 25 seconds. Events: `{id,type,data,ts}`; IDs are decimal strings. No trading commands are accepted. Reconnect on close with exponential backoff and request `/api/realtime/state`.
- `/api/realtime/stream?after=123`: SSE; also accepts `Last-Event-ID`. Reconnect after expiry. Session checks continue during streaming.
- `/api/realtime/poll?after=123`: `{cursor,events,serverTime}`. Poll until caught up when a batch is full.
- `/api/realtime/state`: current counters and durable cursor; clients also refetch page data.

## Agent and maintenance

The six agent POST routes are documented in [agent protocol](agent-protocol.md). Agents use bearer credentials and do not use cookies/CSRF.

`GET|POST /api/cron/maintenance` requires `Authorization: Bearer <CRON_SECRET>`. Missing secrets fail closed; forged cron headers are never accepted. Vercel Cron supplies the authorization header when `CRON_SECRET` is configured. Maintenance prunes historical snapshots by retention, evaluates background offline alerts, and cleans infrastructure rows.
