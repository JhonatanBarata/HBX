# start-all.ps1
# Executa backend (docker), frontend (Next) e Prisma Studio

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$composeFile = Join-Path $scriptRoot "..\docker-compose.yml"
$frontendDir = Join-Path $scriptRoot "..\frontend"
$backendDir = Join-Path $scriptRoot "..\backend"
$orchestratorDir = Join-Path $scriptRoot "..\.orchestrator"
$pidsFile = Join-Path $orchestratorDir "pids.json"

$ErrorActionPreference = 'Stop'

trap {
	$message = $_.Exception.Message
	if (-not [string]::IsNullOrWhiteSpace($message)) {
		Write-Host $message
	}
	exit 1
}

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

function Assert-LocalDatabaseUrl([string]$databaseUrl, [string]$sourceLabel) {
	if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
		throw "Missing DATABASE_URL from $sourceLabel"
	}

	try {
		$uri = [Uri]$databaseUrl
	} catch {
		throw "Invalid DATABASE_URL in $sourceLabel"
	}

	$dbHost = ($uri.Host | ForEach-Object { $_.ToLowerInvariant() })
	if ($dbHost -notin @('localhost', '127.0.0.1')) {
		throw "Refusing to use non-local DATABASE_URL from $sourceLabel. Expected localhost/127.0.0.1, got '$dbHost'."
	}
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

function Invoke-ExternalOrThrow([string]$filePath, [string[]]$arguments, [string]$failureMessage) {
	& $filePath @arguments
	if ($LASTEXITCODE -ne 0) {
		throw $failureMessage
	}
}

function Test-DockerDaemonReady() {
	try {
		$previousErrorActionPreference = $ErrorActionPreference
		$ErrorActionPreference = 'Continue'
		$null = & docker version --format '{{.Server.APIVersion}}' 2>$null
		return ($LASTEXITCODE -eq 0)
	} catch {
		return $false
	} finally {
		$ErrorActionPreference = $previousErrorActionPreference
	}
}

function Assert-DockerReady() {
	if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
		throw "Docker CLI not found in PATH. Install Docker Desktop and try again."
	}

	if (Test-DockerDaemonReady) {
		return
	}

	$dockerService = Get-Service -Name 'com.docker.service' -ErrorAction SilentlyContinue
	if ($null -ne $dockerService -and $dockerService.Status -ne 'Running') {
		throw "Docker Desktop Service is '$($dockerService.Status)'. Start Docker Desktop, wait for the engine to become available, and run npm run up again."
	}

	throw "Docker daemon is not available for the current context. Verify Docker Desktop is open and the 'desktop-linux' engine is healthy, then try again."
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

Assert-DockerReady

Write-Host "1️⃣ Starting backend (docker compose) ..."
Invoke-ExternalOrThrow -filePath 'docker' -arguments @('compose', '-f', $composeFile, 'up', '-d', '--build') -failureMessage 'Failed to start backend containers with docker compose.'

Write-Host "1.0️⃣ Sync backend deps inside container (npm install) ..."
try {
	Invoke-ExternalOrThrow -filePath 'docker' -arguments @('compose', '-f', $composeFile, 'exec', '-T', 'backend', 'sh', '-lc', 'npm install --no-audit --no-fund && npx prisma generate') -failureMessage 'Dependency sync failed in backend container.'
} catch {
	Write-Host "Failed to sync backend dependencies inside container. Showing backend logs:"
	if (Test-DockerDaemonReady) {
		& docker compose -f $composeFile logs backend --tail 120
	}
	throw "Dependency sync failed in backend container"
}

Write-Host "1.1️⃣ Waiting backend health on http://localhost:3000/health ..."
if (-not (Wait-HttpOk -url 'http://localhost:3000/health' -retries 180 -delayMs 500)) {
    Write-Host "Backend did not become reachable on /health. Showing recent logs:"
	if (Test-DockerDaemonReady) {
		& docker compose -f $composeFile logs backend --tail 120
	}
	throw "Backend not reachable at http://localhost:3000/health"
}

Write-Host "2️⃣ Ensuring frontend deps (npm install) ..."
Push-Location $frontendDir
if (!(Test-Path node_modules)) { npm install }
Pop-Location

Write-Host "3️⃣ Starting frontend (Next) on port 3001 ..."
$nextCli = Join-Path $frontendDir 'node_modules\next\dist\bin\next'
if (!(Test-Path -LiteralPath $nextCli)) {
	throw "Frontend CLI not found at $nextCli. Run npm install in frontend first."
}

$frontendCmd = "`$ErrorActionPreference='Stop'; Set-Location -LiteralPath '${frontendDir}'; & node '${nextCli}' dev -p 3001"
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

if ($listenerPid -le 0) {
	Write-Host "Frontend did not open port 3001 in time."
	Stop-IfRunning -processId ([int]$frontendProc.Id) -name 'frontend-wrapper'
	throw "Frontend not reachable at http://localhost:3001"
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
Assert-LocalDatabaseUrl -databaseUrl $env:DATABASE_URL -sourceLabel 'backend/.env'
if (!$env:DIRECT_URL) {
	$env:DIRECT_URL = $env:DATABASE_URL
} else {
	$env:DIRECT_URL = Normalize-DatabaseUrlForHost $env:DIRECT_URL
	Assert-LocalDatabaseUrl -databaseUrl $env:DIRECT_URL -sourceLabel 'backend/.env'
}

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
