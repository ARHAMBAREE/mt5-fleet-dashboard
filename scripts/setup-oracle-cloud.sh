#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# MT5 Fleet Dashboard - Oracle Cloud Infrastructure (OCI) Deployment Script
# Tested on: Ubuntu 22.04 LTS / 24.04 LTS (x86_64 and ARM64 Ampere A1)
# ==============================================================================

echo "=== [1/6] Updating system packages ==="
sudo apt-get update -y
sudo apt-get install -y curl git ufw iptables-persistent debian-keyring debian-archive-keyring apt-transport-https

echo "=== [2/6] Configuring Oracle Cloud OS Firewall (Ports 80 & 443) ==="
# Oracle Cloud Ubuntu images have strict iptables rules that reject incoming ports by default.
sudo iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT || true
sudo iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT || true
if command -v netfilter-persistent >/dev/null 2>&1; then
  sudo netfilter-persistent save || true
fi

if command -v ufw >/dev/null 2>&1; then
  sudo ufw allow 80/tcp || true
  sudo ufw allow 443/tcp || true
  sudo ufw allow 22/tcp || true
fi

echo "=== [3/6] Installing Node.js 24 LTS ==="
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v24* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "Node.js version: $(node -v)"
echo "npm version: $(npm -v)"

echo "=== [4/6] Installing PM2 and Caddy ==="
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
  echo "WARNING: .env file not found in $APP_DIR"
  echo "Please create $APP_DIR/.env with your production variables before starting."
  exit 1
fi

npm ci
npm run db:generate
npm run build

echo "=== [6/6] Starting application with PM2 ==="
pm2 delete mt5-fleet 2>/dev/null || true
pm2 start npm --name "mt5-fleet" -- start -- -p 3000
pm2 save

echo ""
echo "=========================================================================="
echo " Application is running on port 3000!"
echo " Next step: Configure Caddy for SSL and domain reverse proxy."
echo " Edit /etc/caddy/Caddyfile and reload caddy with: sudo systemctl reload caddy"
echo "=========================================================================="
