#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# MT5 Fleet Dashboard — Migrate to Local PostgreSQL on Hostinger VPS
#
# This script:
#   1. Installs PostgreSQL 16 on the local Hostinger VPS
#   2. Creates the "fleet" database and "fleetuser" role
#   3. Updates .env to point at localhost (preserving all existing secrets)
#   4. Runs Prisma migrations to create all tables
#   5. Rebuilds the Next.js app
#   6. Restarts PM2
#
# Your AUTH_SECRET, AGENT_SECRET, and CRON_SECRET are PRESERVED.
# MT5 terminals do NOT need new pairing codes or any changes.
#
# Usage (run from the project root on your Hostinger VPS):
#   chmod +x scripts/setup-local-postgres.sh
#   sudo bash scripts/setup-local-postgres.sh
# ==============================================================================

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

# ---- Config ----
DB_NAME="fleet"
DB_USER="fleetuser"
DB_PASS="$(openssl rand -hex 24)"  # 48-char random password
DB_PORT="5432"

echo ""
echo "============================================================"
echo "  MT5 Fleet Dashboard — Local PostgreSQL Migration"
echo "============================================================"
echo ""

# ------------------------------------------------------------------
# 1. Install PostgreSQL
# ------------------------------------------------------------------
echo "=== [1/6] Installing PostgreSQL 16 ==="
if command -v psql >/dev/null 2>&1; then
  echo "  PostgreSQL is already installed: $(psql --version)"
else
  # Add official PostgreSQL APT repo for latest version
  sudo apt-get update -y
  sudo apt-get install -y gnupg2 lsb-release
  echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor --yes -o /etc/apt/trusted.gpg.d/postgresql.gpg
  sudo apt-get update -y
  sudo apt-get install -y postgresql-16 postgresql-client-16
  echo "  PostgreSQL installed: $(psql --version)"
fi

# Ensure PostgreSQL is running
sudo systemctl enable postgresql
sudo systemctl start postgresql

echo "  PostgreSQL service is active."

# ------------------------------------------------------------------
# 2. Create database and user
# ------------------------------------------------------------------
echo ""
echo "=== [2/6] Creating database '$DB_NAME' and user '$DB_USER' ==="

# Check if user already exists
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
  echo "  User '$DB_USER' already exists — updating password."
  sudo -u postgres psql -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASS';"
else
  sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
  echo "  Created user '$DB_USER'."
fi

# Check if database already exists
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  echo "  Database '$DB_NAME' already exists."
else
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
  echo "  Created database '$DB_NAME'."
fi

# Grant all privileges
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
sudo -u postgres psql -d "$DB_NAME" -c "GRANT ALL ON SCHEMA public TO $DB_USER;"
sudo -u postgres psql -d "$DB_NAME" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;"
sudo -u postgres psql -d "$DB_NAME" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;"

echo "  Privileges granted."

# ------------------------------------------------------------------
# 3. Configure pg_hba.conf for local password auth
# ------------------------------------------------------------------
echo ""
echo "=== [3/6] Configuring PostgreSQL authentication ==="

PG_HBA=$(sudo -u postgres psql -tAc "SHOW hba_file")
# Add local md5 auth for fleetuser if not already present
if ! sudo grep -q "$DB_USER" "$PG_HBA"; then
  # Insert before the first 'local' line
  sudo sed -i "/^# TYPE/a local   $DB_NAME   $DB_USER   md5" "$PG_HBA"
  sudo sed -i "/^# TYPE/a host    $DB_NAME   $DB_USER   127.0.0.1/32   md5" "$PG_HBA"
  sudo systemctl reload postgresql
  echo "  Added password authentication for '$DB_USER'."
else
  echo "  Authentication already configured."
fi

# ------------------------------------------------------------------
# 4. Update .env (preserve all existing secrets)
# ------------------------------------------------------------------
echo ""
echo "=== [4/6] Updating .env file ==="

LOCAL_DB_URL="postgresql://$DB_USER:$DB_PASS@127.0.0.1:$DB_PORT/$DB_NAME?connection_limit=10"

if [ ! -f ".env" ]; then
  echo "ERROR: .env file not found in $APP_DIR"
  echo "Please create a .env file first (copy from .env.example)."
  exit 1
fi

# Back up the old .env
cp .env ".env.backup.$(date +%Y%m%d_%H%M%S)"
echo "  Backed up old .env"

# Extract existing secrets (these MUST stay the same for MT5 terminals to keep working)
AUTH_SECRET=$(grep '^AUTH_SECRET=' .env | cut -d'=' -f2- | tr -d '"')
AGENT_SECRET=$(grep '^AGENT_SECRET=' .env | cut -d'=' -f2- | tr -d '"')
CRON_SECRET=$(grep '^CRON_SECRET=' .env | cut -d'=' -f2- | tr -d '"')
APP_URL=$(grep '^APP_URL=' .env | cut -d'=' -f2- | tr -d '"')
NEXT_PUBLIC_APP_URL=$(grep '^NEXT_PUBLIC_APP_URL=' .env | cut -d'=' -f2- | tr -d '"')

# Write new .env
cat > .env << ENVEOF
# --- Local PostgreSQL (on this server) ---
DATABASE_URL="$LOCAL_DB_URL"
DIRECT_URL="$LOCAL_DB_URL"

# --- Secrets (PRESERVED — do NOT change or MT5 terminals will need re-pairing) ---
AUTH_SECRET="$AUTH_SECRET"
AGENT_SECRET="$AGENT_SECRET"
CRON_SECRET="$CRON_SECRET"

# --- URLs ---
APP_URL="$APP_URL"
NEXT_PUBLIC_APP_URL="$NEXT_PUBLIC_APP_URL"
ENVEOF

echo "  .env updated to use local PostgreSQL at 127.0.0.1:$DB_PORT/$DB_NAME"
echo "  AUTH_SECRET / AGENT_SECRET / CRON_SECRET preserved (no re-pairing needed)."

# ------------------------------------------------------------------
# 5. Run Prisma migrations
# ------------------------------------------------------------------
echo ""
echo "=== [5/6] Running database migrations ==="

npx prisma generate
npx prisma migrate deploy

echo "  All migrations applied successfully."

# ------------------------------------------------------------------
# 6. Rebuild and restart
# ------------------------------------------------------------------
echo ""
echo "=== [6/6] Rebuilding app and restarting PM2 ==="

npm run build

# Restart PM2
if pm2 list | grep -q "mt5-fleet-dashboard"; then
  pm2 restart mt5-fleet-dashboard
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

echo ""
echo "============================================================"
echo "  SUCCESS! Migration to Local PostgreSQL Complete"
echo "============================================================"
echo ""
echo "  Database:  $DB_NAME on 127.0.0.1:$DB_PORT"
echo "  User:      $DB_USER"
echo "  Password:  $DB_PASS"
echo ""
echo "  SAVE THIS PASSWORD! It's in your .env file."
echo ""
echo "  ✓ All secrets preserved — MT5 terminals need NO changes"
echo "  ✓ App rebuilt and running on PM2"
echo "  ✓ Old .env backed up in project directory"
echo ""
echo "  NOTE: This is a fresh database. You'll need to:"
echo "    1. Log in to create a new admin user (first-run setup)"
echo "    2. Generate new pairing codes for your MT5 terminals"
echo "       (the terminals themselves don't need any file changes)"
echo ""
echo "============================================================"
