import {test} from "node:test";
import assert from "node:assert/strict";
import {compareAccountIdentity} from "../shared/account-order";

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
