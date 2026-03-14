# start-all.ps1
# Executa backend (docker), frontend (Next) e Prisma Studio

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$composeFile = Join-Path $scriptRoot "..\docker-compose.yml"
$frontendDir = Join-Path $scriptRoot "..\frontend"
$backendDir = Join-Path $scriptRoot "..\backend"
$orchestratorDir = Join-Path $scriptRoot "..\.orchestrator"
$pidsFile = Join-Path $orchestratorDir "pids.json"

if (!(Test-Path $orchestratorDir)) {
	New-Item -ItemType Directory -Path $orchestratorDir | Out-Null
}

function Stop-IfRunning([int]$processId, [string]$name) {
	if (!$processId) { return }
	try {
		$proc = Get-Process -Id $processId -ErrorAction Stop
		if ($null -ne $proc) {
			Write-Host "Stopping existing $name pid=$processId ..."
			try {
				Stop-Process -Id $processId -Force -ErrorAction Stop
			} catch {
				Write-Host "Could not stop $name pid=$processId. Continuing..."
			}
		}
	} catch {
		# process not found
	}
}

function Import-DotEnv([string]$envPath) {
	if (!(Test-Path -LiteralPath $envPath)) { return }
	Get-Content -LiteralPath $envPath | ForEach-Object {
		$line = $_.Trim()
		if ($line.Length -eq 0) { return }
		if ($line.StartsWith('#')) { return }
		$idx = $line.IndexOf('=')
		if ($idx -lt 1) { return }
		$key = $line.Substring(0, $idx).Trim()
		$val = $line.Substring($idx + 1).Trim()
		if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Substring(1, $val.Length - 2) }
		if ($val.StartsWith("'") -and $val.EndsWith("'")) { $val = $val.Substring(1, $val.Length - 2) }
		if ($key.Length -gt 0) { Set-Item -Path "Env:$key" -Value $val }
	}
}

function Normalize-DatabaseUrlForHost([string]$databaseUrl) {
	if ([string]::IsNullOrWhiteSpace($databaseUrl)) { return $databaseUrl }
	# When running on the host, Docker's service hostname `db` is NOT resolvable.
	$databaseUrl = $databaseUrl -replace '(@)db(?=[:/])', '${1}localhost'
	$databaseUrl = $databaseUrl -replace '://db(?=[:/])', '://localhost'
	return $databaseUrl
}

function Get-ListenerPid([int]$port) {
	try {
		$conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | Select-Object -First 1
		if ($null -ne $conn -and $conn.OwningProcess) { return [int]$conn.OwningProcess }
	} catch {
		# no listener
	}
	return 0
}

function Wait-HttpOk([string]$url, [int]$retries = 60, [int]$delayMs = 500) {
	for ($i = 0; $i -lt $retries; $i++) {
		try {
			$resp = Invoke-WebRequest -UseBasicParsing -Uri $url -Method GET -TimeoutSec 3 -ErrorAction Stop
			if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
				return $true
			}
		} catch {
			# keep trying
		}
		Start-Sleep -Milliseconds $delayMs
	}
	return $false
}

# Stop previously started processes if we have a pid file
if (Test-Path $pidsFile) {
	$prev = $null
	try {
		$prev = Get-Content $pidsFile -Raw | ConvertFrom-Json
	} catch {
		Write-Host "Could not parse $pidsFile ($($_.Exception.Message)). Removing it and continuing..."
		Remove-Item -Force $pidsFile -ErrorAction SilentlyContinue
	}

	if ($null -ne $prev) {
		Stop-IfRunning -processId ([int]$prev.frontend) -name 'frontend'
		Stop-IfRunning -processId ([int]$prev.studio) -name 'prisma-studio'
	}
}

Write-Host "1️⃣ Starting backend (docker compose) ..."
docker compose -f $composeFile up -d --build

Write-Host "1.0️⃣ Sync backend deps inside container (npm install) ..."
try {
	docker compose -f $composeFile exec -T backend sh -lc "npm install --no-audit --no-fund && npx prisma generate"
} catch {
	Write-Host "Failed to sync backend dependencies inside container. Showing backend logs:"
	docker compose -f $composeFile logs backend --tail 120
	throw "Dependency sync failed in backend container"
}

Write-Host "1.1️⃣ Waiting backend health on http://localhost:3000 ..."
if (-not (Wait-HttpOk -url 'http://localhost:3000')) {
	Write-Host "Backend did not become reachable on port 3000. Showing recent logs:"
	docker compose -f $composeFile logs backend --tail 120
	throw "Backend not reachable at http://localhost:3000"
}

Write-Host "2️⃣ Ensuring frontend deps (npm install) ..."
Push-Location $frontendDir
if (!(Test-Path node_modules)) { npm install }
Pop-Location

Write-Host "3️⃣ Starting frontend (Next) on port 3001 ..."
$frontendCmd = "`$ErrorActionPreference='Stop'; Set-Location -LiteralPath '${frontendDir}'; `$env:PORT='3001'; npm run dev"
$frontendProc = Start-Process -FilePath "powershell.exe" -ArgumentList @(
	"-NoProfile",
	"-ExecutionPolicy", "Bypass",
	"-Command", $frontendCmd
) -PassThru -WindowStyle Hidden
Write-Host "Started frontend wrapper pid=$($frontendProc.Id)"

# Wait for the listener on port 3001 and capture the actual process owning the port (node)
$listenerPid = 0
for ($i = 0; $i -lt 40; $i++) {
    $listenerPid = Get-ListenerPid -port 3001
    if ($listenerPid -gt 0) { break }
    Start-Sleep -Milliseconds 250
}

$frontendPidToTrack = $frontendProc.Id
if ($listenerPid -gt 0) { $frontendPidToTrack = $listenerPid }
Write-Host "Frontend listener pid=$frontendPidToTrack (wrapper=$($frontendProc.Id))"

Write-Host "4️⃣ Starting Prisma Studio on port 5555 ..."
# Start Prisma Studio as the actual Node process so the tracked PID owns port 5555.
Import-DotEnv (Join-Path $backendDir '.env')
if (!$env:DATABASE_URL) {
	Write-Host "ERROR: backend/.env does not define DATABASE_URL"
	throw "Missing DATABASE_URL in backend/.env"
}
$env:DATABASE_URL = Normalize-DatabaseUrlForHost $env:DATABASE_URL

$studioArgs = @(
	"node_modules/prisma/build/index.js",
	"studio",
	"--schema", "prisma/schema.prisma",
	"--port", "5555"
)

$studioProc = Start-Process -FilePath "node" -WorkingDirectory $backendDir -ArgumentList $studioArgs -PassThru -WindowStyle Hidden
Start-Sleep -Milliseconds 600
$listenerPid = 0
for ($i = 0; $i -lt 20; $i++) {
	$listenerPid = Get-ListenerPid -port 5555
	if ($listenerPid -gt 0) { break }
	Start-Sleep -Milliseconds 250
}

$studioPidToTrack = $studioProc.Id
if ($listenerPid -gt 0) {
	$studioPidToTrack = $listenerPid
}

Write-Host "Started prisma studio pid=$studioPidToTrack (listener)"

$tmpPidsFile = "${pidsFile}.tmp"
@{
	frontend = $frontendPidToTrack
	studio   = $studioPidToTrack
} | ConvertTo-Json | Set-Content -Path $tmpPidsFile -Encoding UTF8
Move-Item -Force $tmpPidsFile $pidsFile

Write-Host "✅ All processes started. Backend: http://localhost:3000, Frontend: http://localhost:3001, Prisma Studio: http://localhost:5555"
