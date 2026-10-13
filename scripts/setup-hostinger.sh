#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# MT5 Fleet Dashboard - Hostinger VPS Deployment Script
# Tested on: Hostinger KVM VPS (Ubuntu 22.04 / 24.04 LTS)
# ==============================================================================

echo "=== [1/6] Updating system packages ==="
sudo apt-get update -y
sudo apt-get install -y curl git ufw debian-keyring debian-archive-keyring apt-transport-https

echo "=== [2/6] Configuring Firewall (Ports 22, 80, 443) ==="
if command -v ufw >/dev/null 2>&1; then
  sudo ufw allow 22/tcp || true
  sudo ufw allow 80/tcp || true
  sudo ufw allow 443/tcp || true
  sudo ufw --force enable || true
fi

echo "=== [3/6] Installing Node.js 24 LTS ==="
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v24* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "Node.js version: $(node -v)"
echo "npm version: $(npm -v)"

echo "=== [4/6] Installing PM2 and Caddy (Auto-SSL Reverse Proxy) ==="
sudo npm install -g pm2

if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLF 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLF 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update -y
  sudo apt-get install -y caddy
fi

echo "=== [5/6] Building MT5 Fleet Dashboard ==="
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

if [ ! -f ".env" ]; then
  echo "------------------------------------------------------------------------"
  echo "WARNING: .env file not found in $APP_DIR"
  echo "Please copy .env.example to .env and fill in your production variables."
  echo "------------------------------------------------------------------------"
  exit 1
fi

npm ci
npm run db:generate
npm run db:migrate
npm run build

echo "=== [6/6] Starting application with PM2 ==="
pm2 delete mt5-fleet-dashboard 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u "$(whoami)" --hp "$HOME" || true

echo ""
echo "=========================================================================="
echo " SUCCESS! MT5 Fleet Dashboard is running on port 3000 via PM2."
echo "=========================================================================="
echo ""
echo "To point your domain and enable free automatic HTTPS / SSL:"
echo "1. Point your domain DNS A-record to this VPS IP address."
echo "2. Edit /etc/caddy/Caddyfile with:"
echo ""
echo "   yourdomain.com {"
echo "       reverse_proxy 127.0.0.1:3000"
echo "   }"
echo ""
echo "3. Reload Caddy: sudo systemctl reload caddy"
echo "4. Update APP_URL and NEXT_PUBLIC_APP_URL in .env to https://yourdomain.com"
echo "   and restart PM2: pm2 restart mt5-fleet-dashboard"
echo "=========================================================================="
