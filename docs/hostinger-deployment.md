# Hostinger Deployment Guide

This guide covers deploying the **MT5 Fleet Dashboard** to Hostinger.

Because MT5 Fleet Dashboard is a fullstack Next.js application requiring Node.js 24, persistent PostgreSQL, and background telemetry endpoints for MT5 MQL5 Expert Advisors, the deployment path depends on your Hostinger plan:

- **Hostinger VPS (Recommended & Standard)**: Full Linux root access (Ubuntu 22.04 / 24.04). Supports long-lived WebSockets, automated Let's Encrypt SSL, PM2/Docker, and automated background tasks.
- **Hostinger Cloud / Web Hosting (hPanel)**: Managed hosting environment using Hostinger's Node.js application manager (available on Business Web Hosting and Cloud Startup/Professional plans).

---

## Prerequisites (Both Options)

1. **PostgreSQL Database**:
   - Hostinger Web Hosting only provides MySQL/MariaDB natively.
   - You already have an active Supabase PostgreSQL cluster configured in `.env`.
2. **Domain Name**:
   - Your custom domain (e.g. `dashboard.yourdomain.com` or `yourdomain.com`) pointing to Hostinger.
3. **HTTPS / SSL Certificate**:
   - MT5 terminals require HTTPS for `WebRequest`. SSL is required for production.

---

## Option 1: Hostinger VPS (Recommended)

Hostinger KVM VPS gives you maximum speed, zero process restrictions, and full WebSocket / SSE support.

### Step 1: Connect to your VPS via SSH
Open your terminal (macOS/Linux) or PowerShell (Windows):
```bash
ssh root@YOUR_HOSTINGER_VPS_IP
```

### Step 2: Clone your repository
```bash
git clone https://github.com/ARHAMBAREE/mt5-fleet-dashboard.git /var/www/mt5-fleet-dashboard
cd /var/www/mt5-fleet-dashboard
```

### Step 3: Configure Environment Variables
Copy and create your `.env` file:
```bash
cp .env.example .env
nano .env
```
Fill in your production values:
```env
DATABASE_URL="postgresql://postgres.jtgdsispgzhdvkawfnnf:Mt5Dashoad123%40%40@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require&connection_limit=5"
DIRECT_URL="postgresql://postgres.jtgdsispgzhdvkawfnnf:Mt5Dashoad123%40%40@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require"
AUTH_SECRET="cbb11599644b8b7f23005b3b02884d4c8c884286e87440831b05803ef28668b4fb608ec9b25b2f8cfbd409e87226a5ed"
AGENT_SECRET="7104193dc0f7582fa6720db89e3e508637b40489dd07b196040cede32d89f3abd250345a00ab4842eac02f6d1f24fd83"
CRON_SECRET="77a97f7b9f2a81ef933fdebf517daadfbd90bafda5b774965fa44b96bcfca1e8"
APP_URL="https://yourdomain.com"
NEXT_PUBLIC_APP_URL="https://yourdomain.com"
```
*(Replace `https://yourdomain.com` with your actual domain).*

### Step 4: Run the automated setup script
Run the included installer:
```bash
chmod +x scripts/setup-hostinger.sh
./scripts/setup-hostinger.sh
```
This script automatically:
1. Updates Ubuntu and configures the firewall (UFW ports 22, 80, 443).
2. Installs Node.js 24 LTS and PM2.
3. Installs Caddy (reverse proxy with free automatic SSL).
4. Generates Prisma client, applies database migrations, and builds Next.js standalone.
5. Starts the service with PM2 and registers systemd startup.

### Step 5: Configure your Domain & SSL
1. In your domain registrar / Hostinger DNS, create an **A Record**:
   - **Type**: `A`
   - **Name**: `@` (or subdomain like `dashboard`)
   - **Points to**: `YOUR_HOSTINGER_VPS_IP`
2. Edit `/etc/caddy/Caddyfile`:
   ```bash
   sudo nano /etc/caddy/Caddyfile
   ```
   Add:
   ```caddy
   yourdomain.com {
       reverse_proxy 127.0.0.1:3000
   }
   ```
3. Reload Caddy:
   ```bash
   sudo systemctl reload caddy
   ```
   *Caddy automatically issues and renews Let's Encrypt SSL certificates!*

### Alternative VPS deployment with Docker
If you selected the **Ubuntu with Docker** OS template in Hostinger VPS:
```bash
cd /var/www/mt5-fleet-dashboard
docker compose up -d --build
```
Your application will be live on port 3000.

---

## Option 2: Hostinger Web / Cloud Hosting (hPanel)

If you purchased **Hostinger Cloud Hosting** or **Business Web Hosting** (with hPanel):

### Step 1: Open Node.js in hPanel
1. Log into your Hostinger hPanel.
2. Navigate to **Websites** → Select your domain → **Manage**.
3. In the sidebar or search bar, look for **Node.js** (under *Advanced* or *Website*).

### Step 2: Upload Files
You can upload via **Git** (recommended) or **File Manager / FTP**:
- **Option A (Git repository)**:
  - In hPanel, go to **Advanced** → **GIT**.
  - Repository URL: `https://github.com/ARHAMBAREE/mt5-fleet-dashboard.git`
  - Branch: `main`
  - Target directory: `public_html` (or project root).
- **Option B (File Manager)**:
  - Upload project files (exclude `node_modules` and `.git`).

### Step 3: Create `.env` file
In Hostinger File Manager inside your project folder, create `.env` with your production variables:
```env
DATABASE_URL="postgresql://postgres.jtgdsispgzhdvkawfnnf:Mt5Dashoad123%40%40@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require&connection_limit=5"
DIRECT_URL="postgresql://postgres.jtgdsispgzhdvkawfnnf:Mt5Dashoad123%40%40@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require"
AUTH_SECRET="cbb11599644b8b7f23005b3b02884d4c8c884286e87440831b05803ef28668b4fb608ec9b25b2f8cfbd409e87226a5ed"
AGENT_SECRET="7104193dc0f7582fa6720db89e3e508637b40489dd07b196040cede32d89f3abd250345a00ab4842eac02f6d1f24fd83"
CRON_SECRET="77a97f7b9f2a81ef933fdebf517daadfbd90bafda5b774965fa44b96bcfca1e8"
APP_URL="https://yourdomain.com"
NEXT_PUBLIC_APP_URL="https://yourdomain.com"
```

### Step 4: Configure Node.js Settings in hPanel
- **Node.js version**: Choose highest available (v20.x, v22.x, or v24.x).
- **Application mode**: `Production`.
- **Application root**: `public_html` (or where your files were uploaded).
- **Application startup file**: `server.js` (The included universal `server.js` is pre-configured).

### Step 5: Install and Build via SSH or hPanel Terminal
In hPanel **SSH Access** (or terminal):
```bash
npm install
npm run build
```
Then in hPanel Node.js section, click **Restart Application**.

---

## Verifying Deployment & Connecting MT5 Terminals

1. **Visit your website**:
   Open `https://yourdomain.com` in your browser. Register your initial dashboard admin account.
2. **Allow WebRequest in MetaTrader 5**:
   - In MT5: **Tools** → **Options** → **Expert Advisors**.
   - Check **Allow WebRequest for listed URL**.
   - Add: `https://yourdomain.com`.
3. **Attach MT5 Fleet Agent**:
   - In the dashboard, go to **Settings** → **MT5 Agents** → **Add Agent** to get a pairing code.
   - Attach `MT5FleetAgent` to a chart, set `ServerURL` to `https://yourdomain.com`, and enter your pairing code.
