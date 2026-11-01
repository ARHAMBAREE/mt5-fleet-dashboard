import {test} from "node:test";
import assert from "node:assert/strict";
import {compareAccountIdentity} from "../shared/account-order";
import {sortRows} from "../lib/queries/accounts";
import type {AccountSummary} from "../shared/types";

test("account identity order survives shuffled refreshes and changing metrics", () => {
  const rows = [
    {id:"b",login:"123",server:"B",equity:100,status:"ONLINE"},
    {id:"a",login:"123",server:"A",equity:200,status:"OFFLINE"},
    {id:"c",login:"9",server:"A",equity:300,status:"ONLINE"},
  ];
  const ids = (r: typeof rows) => r.sort(compareAccountIdentity).map(a=>a.id);
  assert.deepEqual(ids([...rows]),["c","a","b"]);
  assert.deepEqual(ids([...rows].reverse().map(a=>({...a,equity:0,status:"WARNING"}))),["c","a","b"]);
  assert.notEqual(compareAccountIdentity({...rows[0],id:"1"},{...rows[0],id:"2"}),0);
  assert.ok(compareAccountIdentity({id:"a",server:"A",login:"18446744073709551614"},{id:"b",server:"A",login:"18446744073709551615"})<0);
});

test("custom account order prioritizes chosen account to show first", () => {
  const dummy = {
    displayName: null, favorite: false, broker: "RoboForex", server: "Pro",
    currency: "USD", sourceCurrency: "USD", mode: "LIVE" as const, balance: 1000,
    equity: 1000, credit: 0, margin: 0, freeMargin: 1000, marginLevel: null,
    leverage: 100, tradeAllowed: true, algoTrading: true, terminalConnected: true,
    eaStatus: "ONLINE" as const, lastHeartbeatAt: null, lastSeenLabel: "", floatingPl: 0,
    todayRealizedPl: 0, drawdownPct: 0, maxDrawdownPct: 0, openPositions: 0,
    agentId: null, agentName: null, groups: [], updatedAt: new Date().toISOString(),
  };

  const rows: AccountSummary[] = [
    { ...dummy, id: "acc-1", login: "1001", sortOrder: 1 },
    { ...dummy, id: "acc-2", login: "5201", sortOrder: 0 }, // user chose acc-2 to show first!
    { ...dummy, id: "acc-3", login: "3001", sortOrder: 2 },
  ];

  sortRows(rows, "account", "asc");
  assert.equal(rows[0].id, "acc-2", "acc-2 should be #1 first even with higher login");
  assert.equal(rows[1].id, "acc-1");
  assert.equal(rows[2].id, "acc-3");
});
