import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
const root=resolve('.local');
mkdirSync(root,{recursive:true});
const configPath=join(root,'database.json');
if(!existsSync(configPath)) {
  if(existsSync('.env')) throw new Error('An .env already exists. Use npm run dev with your configured database, or move .env aside before creating a local database.');
  const password=randomBytes(24).toString('hex');
  writeFileSync(configPath,JSON.stringify({password}),{mode:0o600});
  writeFileSync('.env',`DATABASE_URL="postgresql://fleet:${password}@127.0.0.1:15433/fleet"\nDIRECT_URL="postgresql://fleet:${password}@127.0.0.1:15433/fleet"\nAUTH_SECRET="${randomBytes(48).toString('hex')}"\nAGENT_SECRET="${randomBytes(48).toString('hex')}"\nCRON_SECRET="${randomBytes(32).toString('hex')}"\nAPP_URL="http://localhost:3000"\nNEXT_PUBLIC_APP_URL="http://localhost:3000"\n`,{mode:0o600});
}
const {password}=JSON.parse(readFileSync(configPath,'utf8'));
const pg=new EmbeddedPostgres({databaseDir:join(root,'postgres'),user:'fleet',password,port:15433,persistent:true,authMethod:'scram-sha-256',postgresFlags:['-h','127.0.0.1','-k',root],onLog:()=>{},onError:message=>{if(String(message).includes('FATAL')) console.error(String(message));}});
let web;
let stopping=false;
async function stop() {if(stopping)return;stopping=true;web?.kill('SIGTERM');await pg.stop();process.exit();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
try {
  if(!existsSync(join(root,'postgres','PG_VERSION'))) await pg.initialise();
  await pg.start();
  const c=pg.getPgClient();await c.connect();
  if(!(await c.query("SELECT 1 FROM pg_database WHERE datname='fleet'")).rowCount) await c.query('CREATE DATABASE fleet');
  await c.end();
  const env={...process.env,DIRECT_URL:`postgresql://fleet:${password}@127.0.0.1:15433/fleet`,DATABASE_URL:`postgresql://fleet:${password}@127.0.0.1:15433/fleet`};
  execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env,stdio:'inherit'});
  console.log('Local PostgreSQL is ready. Open http://localhost:3000 and create your account.');
  execFileSync(process.execPath,['scripts/copy-agent.cjs']);
  web=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p','3000'],{env,stdio:'inherit'});
  web.once('exit',()=>void stop());
} catch(e) {console.error(e);await pg.stop().catch(()=>{});process.exitCode=1;}
