# MT5 agent protocol v1

Transport: HTTPS POST, UTF-8 compact JSON, `Content-Type: application/json`. All subsequent requests after registration use `Authorization: Bearer m5a_...`. Only hashed agent credentials are stored on the backend. Installation UUIDs identify local agent state; server-generated credentials supply authentication entropy.

| Endpoint | Body |
| --- | --- |
| `/api/agent/register` | `v:1,pairingCode,installationId,platform,terminalBuild,terminalCompany,terminalName,eaVersion` |
| `/api/agent/heartbeat` | `v:1,accountLogin,server,broker,terminalConnected,algoTrading,eaLoaded,build` |
| `/api/agent/snapshot` | `v:1,account:{login,broker,server,currency,balance,equity,credit,margin,freeMargin,marginLevel,leverage,mode,tradeAllowed,algoTrading,terminalConnected}` |
| `/api/agent/positions` | `v:1,accountLogin,server,full,positions,removed?` |
| `/api/agent/orders` | `v:1,accountLogin,server,full,orders,removed?` |

Position fields: `ticket,symbol,type,volume,openPrice,currentPrice,sl,tp,swap,commission,profit,magic,comment,openTime`.
Order fields: `ticket,symbol,type,volume,price,sl,tp,magic,comment,createTime`.

Tickets and magic values are sent as **decimal strings**, not floating point JSON numbers. Protocol also accepts safe legacy integer numbers. Timestamps are epoch seconds. Financial values must be finite numbers. Account mode is LIVE/DEMO (MT5 contest mode currently maps to LIVE).

## Lifecycle

1. A dashboard owner generates a pairing code; the database stores its HMAC and expiry. The pairing exchange atomically consumes the code once.
2. EA persists installation ID, credential, agent ID in its terminal-private `MQL5/Files` directory. No passwords are read from MT5.
3. Snapshot establishes the exact account identity `(owner,login,server)` and binds it to the installation. Positions/orders before this binding receive HTTP 409.
4. Heartbeats refresh health and can request a full reconciliation. Network communication occurs exclusively inside `OnTimer`, never `OnTick`.
5. Positions/orders compare serialized sets and omit unchanged uploads. Changed sets are sent as full reconciliations; this handles removals and retries. The API also accepts partial upserts with `removed` tickets. Each set is a transaction.
6. Revocation causes HTTP 401; the agent clears the credential and requires a new pairing code. Accounts remain stored. On network errors a full position/order reconciliation is requested on recovery.

Registration returns `{ok,agentId,credential,heartbeatSeconds,snapshotSeconds}`. Heartbeat returns `{ok,serverTime,heartbeatSeconds,snapshotSeconds,fullSync}`. Snapshot returns `{ok,serverTime,fullSync}`.

## Accounting semantics

- Floating account P/L = equity − balance − credit. Already-booked entry commission must not be subtracted again from account equity.
- Reported open-position commission is the available entry fee allocation for remaining volume. It is not a broker quote for future closing fees; complex netting/reversal allocations may differ from a broker's statement.
- MT5 reports server times. The EA estimates current broker offset in 15-minute increments unless `BrokerUTCOffsetMinutes` is set. Historical broker DST changes may require operator reconciliation; no broker timezone database is inferred.
- EA health means this telemetry EA, not arbitrary other trading EAs on other charts. Algo trading status reports terminal/account permission; monitoring itself never places trades.

Test compilation in MetaEditor and validate against a demo terminal with positions, pending orders, partial closes and reconnects before using operationally. MT5 `WebRequest` does not operate in Strategy Tester. Source references: [WebRequest](https://www.mql5.com/en/docs/network/webrequest), [position properties](https://www.mql5.com/en/docs/constants/tradingconstants/positionproperties), [history selection](https://www.mql5.com/en/docs/trading/historydealgetticket).

EA 1.01 removes trade-history uploads and cursor persistence. Existing credential files remain compatible. Local broker history is read only to calculate the commission for currently open positions; closed deal records are never sent. Exposure is measured in lots.

Broker telemetry is stored in its original currency. Account read APIs label USC monetary amounts as USD without scaling, per the owner’s display preference (not an actual currency conversion), returning `sourceCurrency` alongside the display `currency`. Percentages, lots, leverage and symbol prices are unchanged. Agent alert thresholds and standalone position/order reports remain in broker-native units.
