Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   MT5 Fleet Dashboard - Windows VPS Auto-Installer       " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$ProgressPreference = 'SilentlyContinue'

# 1. Ensure Node.js is installed
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[1/5] Installing Node.js 24 LTS..." -ForegroundColor Yellow
    $nodeUrl = "https://nodejs.org/dist/v24.13.0/node-v24.13.0-x64.msi"
    $nodeMsi = "$env:TEMP\node.msi"
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeMsi
    Start-Process msiexec.exe -ArgumentList "/i `"$nodeMsi`" /qn" -Wait
    $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
} else {
    Write-Host "[1/5] Node.js is already installed: $(node -v)" -ForegroundColor Green
}

# 2. Ensure Git is installed
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "[2/5] Installing Git..." -ForegroundColor Yellow
    $gitUrl = "https://github.com/git-for-windows/git/releases/download/v2.48.1.windows.1/Git-2.48.1-64-bit.exe"
    $gitExe = "$env:TEMP\git.exe"
    Invoke-WebRequest -Uri $gitUrl -OutFile $gitExe
    Start-Process $gitExe -ArgumentList "/VERYSILENT /NORESTART" -Wait
    $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
} else {
    Write-Host "[2/5] Git is already installed" -ForegroundColor Green
}

# 3. Clone or pull repo
$installDir = "C:\mt5-fleet-dashboard"
if (-not (Test-Path $installDir)) {
    Write-Host "[3/5] Downloading MT5 Fleet Dashboard into $installDir..." -ForegroundColor Yellow
    git clone https://x-access-token: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@github.com/ARHAMBAREE/mt5-fleet-dashboard.git $installDir
} else {
    Write-Host "[3/5] Updating repository in $installDir..." -ForegroundColor Yellow
    Set-Location $installDir
    git pull
}

Set-Location $installDir

# 4. Create .env file with production Supabase credentials
Write-Host "[4/5] Writing production database configuration..." -ForegroundColor Yellow
$envContent = @"
DATABASE_URL="postgresql://postgres.jtgdsispgzhdvkawfnnf:Mt5Dashoad123%40%40@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require&connection_limit=5"
DIRECT_URL="postgresql://postgres.jtgdsispgzhdvkawfnnf:Mt5Dashoad123%40%40@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require"
AUTH_SECRET="cbb11599644b8b7f23005b3b02884d4c8c884286e87440831b05803ef28668b4fb608ec9b25b2f8cfbd409e87226a5ed"
AGENT_SECRET="7104193dc0f7582fa6720db89e3e508637b40489dd07b196040cede32d89f3abd250345a00ab4842eac02f6d1f24fd83"
CRON_SECRET="77a97f7b9f2a81ef933fdebf517daadfbd90bafda5b774965fa44b96bcfca1e8"
APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
"@
Set-Content -Path "$installDir\.env" -Value $envContent -Encoding utf8

# 5. Build and setup Cloudflare Tunnel
Write-Host "[5/5] Building application..." -ForegroundColor Yellow
npm install
npm run db:generate
npm run build

# Download cloudflared if missing
$cfExe = "C:\cloudflared.exe"
if (-not (Test-Path $cfExe)) {
    Write-Host "Downloading Cloudflare Tunnel..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cfExe
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "   SUCCESS: Starting Dashboard and Generating Phone Link!  " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

# Launch Dashboard
Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$installDir'; npm start`""

# Launch Tunnel
Start-Process powershell -ArgumentList "-NoExit -Command `"$cfExe tunnel --url http://localhost:3000`""

