import {test} from "node:test";
import assert from "node:assert/strict";
import {latestGoldQuote,type GoldTarget} from "../shared/gold";

test("gold quote selects newest valid USD terminal price without changing input",()=>{
  const rows = [
    {id:"a",symbol:"XAUUSD",currentPrice:2300,updatedAt:"2026-10-09T10:00:00Z"},
    {id:"b",symbol:"GOLD",currentPrice:2301,updatedAt:"2026-10-09T10:01:00Z"},
    {id:"c",symbol:"XAUEUR",currentPrice:2400,updatedAt:"2026-10-09T10:02:00Z"},
    {id:"d",symbol:"XAUUSD",currentPrice:0,updatedAt:"2026-10-09T10:03:00Z"},
  ] as GoldTarget[];
  assert.equal(latestGoldQuote(rows)?.id,"b");
  assert.equal(rows[0].id,"a");
  assert.equal(latestGoldQuote([]),null);
  assert.equal(latestGoldQuote([{...rows[0],updatedAt:"invalid"}]),null);
});
