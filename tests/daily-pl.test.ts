import test from 'node:test';
import assert from 'node:assert/strict';
import {reportingDay,todayRealized} from '../lib/daily-pl';
test('daily profit reflects broker day realized profit without timezone distortion',()=>{
 const now=new Date('2026-10-08T18:59:59Z');
 assert.equal(todayRealized(123,'2026-10-08',now),123);
 assert.equal(todayRealized(0,'2026-10-09',now),0);
 assert.equal(todayRealized(null,null,now),null);
 assert.equal(todayRealized(undefined,undefined,now),null);
});
