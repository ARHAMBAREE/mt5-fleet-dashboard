const fs=require('node:fs');
fs.mkdirSync('public/downloads',{recursive:true});
fs.copyFileSync('mt5-agent/MT5FleetAgent.mq5','public/downloads/MT5FleetAgent.mq5');
