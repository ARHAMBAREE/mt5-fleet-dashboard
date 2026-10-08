const fs = require('node:fs');
require('@next/env').loadEnvConfig(process.cwd());
const url = process.env.ELECTRON_APP_URL || (process.env.APP_URL?.startsWith('https://') ? process.env.APP_URL : '') || '';
if (url && new URL(url).protocol !== 'https:') throw new Error('Packaged desktop URL must use HTTPS; unset it to show first-run setup');
fs.writeFileSync('electron/assets/config.json', JSON.stringify({ url: url ? new URL(url).origin : '', updateUrl: process.env.APP_UPDATE_URL || '' }));
