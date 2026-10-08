// Isolated disposable PostgreSQL cluster. Never connects to DATABASE_URL from .env.
import EmbeddedPostgres from 'embedded-postgres';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { once } from 'node:events';
const temp = mkdtempSync(join(tmpdir(), 'mt5-fleet-test-'));
const port = 15432, webPort = 13400;
const password = randomBytes(20).toString('hex');
const env = { ...process.env, DIRECT_URL: `postgresql://fleet:${password}@127.0.0.1:${port}/fleet`, DATABASE_URL: `postgresql://fleet:${password}@127.0.0.1:${port}/fleet`, AUTH_SECRET: randomBytes(48).toString('hex'), AGENT_SECRET: randomBytes(48).toString('hex'), CRON_SECRET: randomBytes(32).toString('hex'), APP_URL: `http://localhost:${webPort}`, NEXT_PUBLIC_APP_URL: `http://localhost:${webPort}` };
const pg = new EmbeddedPostgres({ databaseDir: join(temp, 'db'), user: 'fleet', password, port, persistent: false, authMethod: 'scram-sha-256', postgresFlags: ['-h', '127.0.0.1', '-k', temp], onLog: () => {}, onError: () => {} });
let server, client, wsServer, socket;
let logs = '';
async function api(path, { method='GET', body, cookie='', bearer='', csrf=true }={}) {
  const headers = { 'content-type': 'application/json', cookie };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  if (csrf && cookie) headers['x-csrf-token'] = cookie.split('; ').find(x => x.startsWith('mt5fleet_csrf='))?.split('=')[1] ?? '';
  const response = await fetch(`http://localhost:${webPort}/api${path}`, { method, headers, body: body===undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data, cookie: response.headers.getSetCookie().map(x => x.split(';')[0]).join('; ') };
}
function ok(result, expected=200) { assert.equal(result.status, expected, JSON.stringify(result.data)); return result.data; }
try {
  await pg.initialise(); await pg.start(); await pg.createDatabase('fleet');
  client = pg.getPgClient('fleet'); await client.connect();
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js','migrate','deploy'], { env, stdio: 'pipe' });
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next','start','-p',String(webPort)], { env, stdio: ['ignore','pipe','pipe'] });
  server.stdout.on('data', d => { logs += d; }); server.stderr.on('data', d => { logs += d; });
  let ready=false;
  for (let i=0;i<100;i++) { try { const r=await fetch(`http://localhost:${webPort}/login`); if(r.ok){ready=true;break;} } catch {} await new Promise(r=>setTimeout(r,200)); }
  assert.ok(ready, 'Server must start');
  wsServer = spawn(process.execPath, ['--conditions=react-server','--import','tsx','server/websocket/standalone.ts'], {env:{...env,WS_PORT:'13401'},stdio:['ignore','pipe','pipe']});
  wsServer.stdout.on('data',d=>{logs+=d;});wsServer.stderr.on('data',d=>{logs+=d;});
  const signup=await api('/auth/register',{method:'POST',body:{email:'test@example.invalid',password:'FleetTest!Only123',name:'Integration test'}});
  ok(signup); const cookie=signup.cookie;
  ok(await api('/auth/me',{cookie}));
  assert.equal((await api('/agents',{method:'POST',cookie,csrf:false,body:{}})).status,403);
  const pairing=ok(await api('/agents',{method:'POST',cookie,body:{label:'Test installation'}}),201);
  const registrations=await Promise.all([1,2].map(()=>api('/agent/register',{method:'POST',body:{v:1,pairingCode:pairing.code,installationId:randomUUID()}})));
  assert.deepEqual(registrations.map(r=>r.status).sort(),[201,400]);
  const paired=registrations.find(r=>r.status===201).data;
  const bearer=paired.credential;
  const identity={v:1,accountLogin:'12345',server:'Test-Demo'};
  assert.equal((await api('/agent/positions',{method:'POST',bearer,body:{...identity,full:true,positions:[]}})).status,409);
  const account={login:'12345',broker:'Test only',server:'Test-Demo',currency:'USD',balance:1000,equity:1050,credit:0,margin:100,freeMargin:950,marginLevel:1050,leverage:100,mode:'DEMO',tradeAllowed:true,algoTrading:true,terminalConnected:true};
  ok(await api('/agent/snapshot',{method:'POST',bearer,body:{v:1,account}}));
  ok(await api('/agent/heartbeat',{method:'POST',bearer,body:{...identity,broker:account.broker,terminalConnected:true,algoTrading:true,eaLoaded:true}}));
  const position={ticket:'18446744073709551614',symbol:'XAUUSD',type:'BUY',volume:1,openPrice:2000,currentPrice:2050,sl:0,tp:0,swap:0,commission:-2,profit:50,magic:'9007199254740993',comment:'=FORMULA',openTime:Math.floor(Date.now()/1000)};
  ok(await api('/agent/positions',{method:'POST',bearer,body:{...identity,full:true,positions:[position]}}));
  assert.equal((await api('/agent/positions',{method:'POST',bearer,body:{...identity,server:'Other',full:true,positions:[]}})).status,409);
  const accounts=ok(await api('/accounts',{cookie})); assert.equal(accounts.rows.length,1);
  const id=accounts.rows[0].id; assert.equal(accounts.rows[0].floatingPl,50);
  const gold=ok(await api('/accounts?includeGold=1',{cookie})); assert.equal(gold.goldTargets.length,1); assert.equal(gold.goldTargets[0].magic,position.magic); assert.equal(gold.goldTargets[0].currentPrice,2050);
  socket=new WebSocket('ws://localhost:13401/api/ws',{headers:{Cookie:cookie,Origin:env.APP_URL}});
  await Promise.race([once(socket,'open'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('WS connect timeout')),5000))]);
  const replay=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('WS replay timeout')),6000);socket.on('message',raw=>{const event=JSON.parse(raw.toString());if(event.id){clearTimeout(timer);resolve(event);}});});
  socket.send(JSON.stringify({type:'hello',cursor:'0'}));
  assert.ok((await replay).id);
  const pong=new Promise(resolve=>socket.on('message',raw=>{if(JSON.parse(raw.toString()).type==='pong')resolve(true);}));
  socket.send(JSON.stringify({type:'ping'}));assert.equal(await pong,true);
  const positions=ok(await api('/positions',{cookie})); assert.equal(positions.items[0].ticket,position.ticket); assert.equal(positions.items[0].magic,position.magic);
  assert.equal((await fetch(`${env.APP_URL}/api/agent/history`,{method:'POST',headers:{Authorization:`Bearer ${bearer}`}})).status,404);
  assert.equal((await fetch(`${env.APP_URL}/api/history`,{headers:{Cookie:cookie}})).status,404);
  assert.equal((await api('/export?type=history',{cookie})).status,400);
  assert.equal((await client.query("SELECT to_regclass('public.deals') AS name")).rows[0].name,null);
  const detail=ok(await api(`/accounts/${id}`,{cookie}));assert.equal(detail.risk.equityPeak,1050); assert.equal("history" in detail,false); assert.equal("dailyPl" in detail.risk,false);
  ok(await api('/agent/snapshot',{method:'POST',bearer,body:{v:1,account:{...account,server:'Test-EUR',currency:'EUR'}}}));
  const reportingDay=new Date(Date.now()+18000000).toISOString().slice(0,10);
  assert.equal(ok(await api('/accounts?currency=USD',{cookie})).totals.todayRealizedPl,null);
  ok(await api('/agent/snapshot',{method:'POST',bearer,body:{v:1,account:{...account,todayRealizedPl:125,realizedPlDay:reportingDay}}}));
  assert.equal(ok(await api('/accounts?currency=USD',{cookie})).totals.todayRealizedPl,125);
  ok(await api('/agent/snapshot',{method:'POST',bearer,body:{v:1,account:{...account,todayRealizedPl:999,realizedPlDay:'2000-01-01'}}}));
  assert.equal(ok(await api('/accounts?currency=USD',{cookie})).totals.todayRealizedPl,null);
  const mixed=ok(await api('/accounts',{cookie}));assert.equal(mixed.rows.length,2);assert.equal(mixed.totals.totalBalance,null);
  const mixedAnalytics=ok(await api('/analytics',{cookie}));assert.equal(mixedAnalytics.totals.combinedEquity,null);assert.equal(mixedAnalytics.series.length,0);
  ok(await api('/agent/snapshot',{method:'POST',bearer,body:{v:1,account:{...account,equity:840}}}));
  const drawdownDetail=ok(await api(`/accounts/${id}`,{cookie}));assert.equal(drawdownDetail.risk.maxDrawdownPct,20);

  const analytics=ok(await api('/analytics?currency=USD',{cookie})); assert.equal(analytics.series.at(-1).equity,1050);
  ok(await api(`/export?type=positions&format=json&accountId=${id}`,{cookie}));
  assert.equal((await api('/analytics?range=bad',{cookie})).status,400);
  const second=await api('/auth/register',{method:'POST',body:{email:'other@example.invalid',password:'FleetTest!Only123',name:'Other test'}});ok(second);
  assert.equal((await api(`/accounts/${id}`,{cookie:second.cookie})).status,404);
  assert.equal(ok(await api('/accounts',{cookie:second.cookie})).rows.length,0);
  assert.equal(ok(await api('/accounts?includeGold=1',{cookie:second.cookie})).goldTargets.length,0);
  // Unlimited retention must preserve old snapshots, while 7d removes only snapshots.
  await client.query('UPDATE equity_snapshots SET at = NOW() - INTERVAL \'400 days\'');
  ok(await api('/settings',{method:'PUT',cookie,body:{key:'retention',value:{period:'unlimited'}}}));
  assert.equal((await api('/cron/maintenance')).status,401);
  ok(await api('/cron/maintenance',{bearer:env.CRON_SECRET}));
  assert.equal(Number((await client.query('SELECT count(*) FROM equity_snapshots')).rows[0].count),2);
  ok(await api('/settings',{method:'PUT',cookie,body:{key:'retention',value:{period:'7d'}}}));
  ok(await api('/cron/maintenance',{bearer:env.CRON_SECRET}));
  assert.equal(Number((await client.query('SELECT count(*) FROM equity_snapshots')).rows[0].count),0);
  assert.equal(Number((await client.query('SELECT count(*) FROM accounts')).rows[0].count),2);
  ok(await api('/agent/positions',{method:'POST',bearer,body:{...identity,full:true,positions:[]}}));
  assert.equal(ok(await api('/positions',{cookie})).total,0);
  // Cent accounts join dollar accounts without changing broker-native stored values.
  const centAccount={...account,server:'Test-Cent',currency:'USC',balance:100000,equity:105000,margin:10000,freeMargin:95000};
  ok(await api('/agent/snapshot',{method:'POST',bearer,body:{v:1,account:centAccount}}));
  const dollars=ok(await api('/accounts?currency=USD',{cookie}));
  assert.equal(dollars.rows.length,2); assert.deepEqual(dollars.totals.currencies,['USD']);
  assert.equal(dollars.totals.totalBalance,101000); assert.equal(dollars.totals.totalEquity,105840);
  assert.equal(dollars.totals.floatingPl,4840);
  const cent=dollars.rows.find(r=>r.sourceCurrency==='USC');
  assert.equal(cent.balance,100000); assert.equal(cent.equity,105000); assert.equal(cent.currency,'USD');
  const centDetail=ok(await api(`/accounts/${cent.id}`,{cookie}));
  assert.equal(centDetail.account.balance,100000); assert.equal(centDetail.account.margin,10000);
  assert.equal(centDetail.risk.equityPeak,105000); assert.equal(centDetail.series.equity.at(-1).v,105000);
  const dollarAnalytics=ok(await api('/analytics?currency=USD',{cookie}));
  assert.equal(dollarAnalytics.totals.combinedBalance,101000);
  assert.equal(dollarAnalytics.series.at(-1).equity,105000);
  assert.equal(dollarAnalytics.best.floatingPl,5000);
  assert.equal((await client.query('SELECT balance FROM accounts WHERE id=$1',[cent.id])).rows[0].balance,100000);
  const exported=ok(await api('/export?type=accounts&format=json',{cookie}));
  assert.equal(exported.accounts.find(r=>r.id===cent.id).balance,100000);
  ok(await api(`/agents/${paired.agentId}`,{method:'DELETE',cookie}));
  assert.equal((await api('/agent/snapshot',{method:'POST',bearer,body:{v:1,account}})).status,401);
  ok(await api('/auth/logout',{method:'POST',cookie,body:{}}));
  assert.equal((await api('/auth/me',{cookie})).status,401);
  const login=await api('/auth/login',{method:'POST',body:{email:'test@example.invalid',password:'FleetTest!Only123'}});ok(login);ok(await api('/auth/me',{cookie:login.cookie}));
  console.log('PASS: migrations, registration/login/logout, session revocation, CSRF, concurrent pairing, telemetry, 64-bit identifiers, removed history endpoints/storage, tenant isolation, WebSocket replay/ping, mixed currencies, USD/USC display override, lifetime drawdown, analytics, exports, retention, reconciliation, agent revocation.');
} catch(error) {
  writeFileSync('/tmp/mt5-integration-server.log',logs.replaceAll(password,'[redacted]'));
  console.error(error); console.error('Server diagnostics: /tmp/mt5-integration-server.log'); process.exitCode=1;
} finally {
  socket?.terminate();
  wsServer?.kill('SIGTERM');
  if(server){ server.kill('SIGTERM'); await Promise.race([once(server,'exit'),new Promise(r=>setTimeout(r,5000))]); }
  if(client) await client.end();
  await pg.stop().catch(()=>{});
  rmSync(temp,{recursive:true,force:true});
}
