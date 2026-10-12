import test from 'node:test';
import assert from 'node:assert/strict';
import { observeMonthlyPl, monthlyValue } from '../lib/monthly-pl';
const day = '2026-10-12', now = new Date('2026-10-12T10:00:00Z');
test('monthly P&L starts at zero, counts only changes and never doubles repeats', () => {
 let state = observeMonthlyPl(null, 500, day, now);
 assert.equal(state?.total, 0);
 state = observeMonthlyPl(state, 520, day, now);
 assert.equal(state?.total, 20);
 state = observeMonthlyPl(state, 520, day, now);
 assert.equal(state?.total, 20);
 state = observeMonthlyPl(state, 480, day, now);
 assert.equal(state?.total, -20);
 assert.equal(observeMonthlyPl(state, undefined, undefined, now), state);
 assert.equal(observeMonthlyPl(state, 999, '2026-10-11', now), state);
});
test('daily rollover adds the new day without treating reset as loss', () => {
 let state = observeMonthlyPl(null, 500, day, now);
 state = observeMonthlyPl(state, 530, day, now);
 state = observeMonthlyPl(state, 15, '2026-10-13', new Date('2026-10-12T19:00:00Z'));
 assert.equal(state?.total, 45);
});
test('month rolls over at Pakistan midnight, persists across restart and keeps first baseline date', () => {
 let state = observeMonthlyPl(null, 500, day, now);
 state = observeMonthlyPl(state, 550, day, now);
 const next = new Date('2026-10-31T19:00:00Z');
 assert.equal(monthlyValue(state, next), 0);
 state = observeMonthlyPl(JSON.parse(JSON.stringify(state)), 12, '2026-11-01', next);
 assert.equal(state?.total, 12);
 assert.equal(state?.startedAt, now.toISOString());
 assert.equal(monthlyValue(null, next), null);
});
