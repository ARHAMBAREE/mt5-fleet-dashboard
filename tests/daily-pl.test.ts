import test from 'node:test';
import assert from 'node:assert/strict';
import {reportingDay,todayRealized} from '../lib/daily-pl';
test('daily profit rolls over at Pakistan midnight and old reports become unavailable',()=>{
 const before=new Date('2026-10-08T18:59:59Z');const after=new Date('2026-10-08T19:00:00Z');
 assert.equal(reportingDay(before),'2026-10-08');assert.equal(reportingDay(after),'2026-10-09');
 assert.equal(todayRealized(123,'2026-10-08',before),123);
 assert.equal(todayRealized(123,'2026-10-08',after),null);
 assert.equal(todayRealized(0,'2026-10-09',after),0);
 assert.equal(todayRealized(null,null,after),null);
});
