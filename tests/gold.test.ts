import test from 'node:test';
import assert from 'node:assert/strict';
import { groupGoldGrids, type GoldTarget } from '../shared/gold';
const base: GoldTarget = {id:'1',accountId:'a',login:'123',server:'demo',symbol:'XAUUSD',ticket:'1',magic:'42',type:'BUY',volume:0.1,currentPrice:3000,tp:3020,updatedAt:'2026-10-08T10:00:00Z',online:true};
test('grid combines shared TP and volume while preserving account, EA, symbol and direction boundaries', () => {
 const grids=groupGoldGrids([base,{...base,id:'2',ticket:'2'}, {...base,id:'3',accountId:'b'}, {...base,id:'4',magic:'43'}, {...base,id:'5',type:'SELL'}, {...base,id:'6',symbol:'XAUUSDm'}]);
 assert.equal(grids.length,5);assert.equal(grids[0].positionCount,2);assert.equal(grids[0].volume,0.2);assert.equal(grids[0].tp,3020);
});
test('missing or differing TP is not fabricated as a basket TP', () => {
 for (const tp of [0,3030]) {
  const grid=groupGoldGrids([base,{...base,id:'2',tp}])[0];
  assert.equal(grid.tp,0);assert.equal(grid.tpState,'mixed');
 }
 assert.equal(groupGoldGrids([{...base,tp:0}])[0].tpState,'missing');
});
