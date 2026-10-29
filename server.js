// Root entrypoint for production environments (Hostinger Node.js manager, cPanel, or custom process managers)
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.PORT = process.env.PORT || '3000';
process.env.HOSTNAME = process.env.HOSTNAME || '0.0.0.0';

process.on('uncaughtException', (err) => {
  console.error('[server uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[server unhandledRejection]', reason);
});

const fs = require('node:fs');
const path = require('node:path');

const standaloneServer = path.join(__dirname, '.next', 'standalone', 'server.js');

if (fs.existsSync(standaloneServer)) {
  console.log(`> Loading Next.js standalone server from ${standaloneServer}`);
  require(standaloneServer);
} else {
  const { createServer } = require('node:http');
  const next = require('next');
  const app = next({ dev: false, dir: __dirname });
  const handle = app.getRequestHandler();
  app.prepare().then(() => {
    createServer((req, res) => handle(req, res)).listen(Number(process.env.PORT), process.env.HOSTNAME, () => {
      console.log(`> MT5 Fleet Dashboard listening on http://${process.env.HOSTNAME}:${process.env.PORT}`);
    });
  }).catch((err) => {
    console.error('Error starting server:', err);
    process.exit(1);
  });
}
