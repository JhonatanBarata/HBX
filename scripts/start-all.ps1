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

function Invoke-ExternalOrThrow([string]$filePath, [string[]]$arguments, [string]$failureMessage) {
	& $filePath @arguments
	if ($LASTEXITCODE -ne 0) {
		throw "$failureMessage Exit code: $LASTEXITCODE."
	}
}

function Show-ComposeLogs([string[]]$services, [int]$tail = 120) {
	if (-not (Test-DockerDaemonReady)) { return }

	foreach ($service in $services) {
		Write-Host "Recent logs for ${service}:"
		try {
			& docker compose -f $composeFile logs $service --tail $tail
		} catch {
			Write-Host "Could not read logs for ${service}: $($_.Exception.Message)"
		}
	}
}

function Wait-PortListener([int]$port, [int]$retries = 120, [int]$delayMs = 500) {
	for ($i = 0; $i -lt $retries; $i++) {
		$listenerPid = Get-ListenerPid -port $port
		if ($listenerPid -gt 0) { return $listenerPid }
		Start-Sleep -Milliseconds $delayMs
	}
	return 0
}

function Wait-ComposeServiceRunning([string]$service, [int]$retries = 120, [int]$delayMs = 500) {
	for ($i = 0; $i -lt $retries; $i++) {
		try {
			$serviceId = (& docker compose -f $composeFile ps -q $service 2>$null)
			if (-not [string]::IsNullOrWhiteSpace($serviceId)) {
				$status = (& docker inspect -f '{{.State.Status}}' $serviceId 2>$null)
				if ($LASTEXITCODE -eq 0 -and $status -eq 'running') { return $true }
				if ($status -in @('exited', 'dead')) { return $false }
			}
		} catch {
			# keep trying
		}
		Start-Sleep -Milliseconds $delayMs
	}
	return $false
}

function Wait-ComposePostgresReady([int]$retries = 120, [int]$delayMs = 500) {
	for ($i = 0; $i -lt $retries; $i++) {
		try {
			$null = & docker compose -f $composeFile exec -T db pg_isready -U admin -d jhonatan_dev 2>$null
			if ($LASTEXITCODE -eq 0) { return $true }
		} catch {
			# keep trying while postgres finishes startup/recovery
		}
		Start-Sleep -Milliseconds $delayMs
	}
	return $false
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

Write-Host "1) Starting backend (docker compose) ..."
try {
	Invoke-ExternalOrThrow -filePath 'docker' -arguments @('compose', '-f', $composeFile, 'up', '-d', '--build') -failureMessage 'Failed to start backend containers with docker compose.'
} catch {
	Write-Host "Docker compose failed while starting services."
	Show-ComposeLogs -services @('db', 'backend', 'hbx-scraping-engine') -tail 80
	throw
}

Write-Host "1.0) Waiting database to accept connections ..."
if (-not (Wait-ComposePostgresReady -retries 180 -delayMs 500)) {
	Write-Host "Database did not become ready in time."
	Show-ComposeLogs -services @('db') -tail 120
	throw "Database is not ready."
}

Write-Host "1.0.1) Waiting backend container to be running ..."
if (-not (Wait-ComposeServiceRunning -service 'backend' -retries 180 -delayMs 500)) {
	Write-Host "Backend container did not reach running state."
	Show-ComposeLogs -services @('backend', 'db') -tail 120
	throw "Backend container is not running."
}

Write-Host "1.1) Sync backend deps inside container (npm install) ..."
try {
	Invoke-ExternalOrThrow -filePath 'docker' -arguments @('compose', '-f', $composeFile, 'exec', '-T', 'backend', 'sh', '-lc', 'npm install --no-audit --no-fund && npx prisma generate') -failureMessage 'Dependency sync failed in backend container.'
} catch {
	Write-Host "Failed to sync backend dependencies inside container. Showing backend logs:"
	Show-ComposeLogs -services @('backend') -tail 120
	throw "Dependency sync failed in backend container."
}

Write-Host "1.2) Waiting backend port on http://localhost:3000 ..."
$backendListenerPid = Wait-PortListener -port 3000 -retries 180 -delayMs 500
if ($backendListenerPid -le 0) {
	Write-Host "Backend did not open port 3000 in time."
	Show-ComposeLogs -services @('backend', 'db') -tail 120
	throw "Backend port 3000 is not listening."
}
Write-Host "Backend port 3000 is listening."

Write-Host "2) Ensuring frontend deps (npm install) ..."
Push-Location $frontendDir
try {
	if (!(Test-Path node_modules)) {
		Invoke-ExternalOrThrow -filePath 'npm' -arguments @('install') -failureMessage 'Frontend npm install failed.'
	}
} finally {
	Pop-Location
}

Write-Host "3) Starting frontend (Next) on port 3001 ..."
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
$listenerPid = Wait-PortListener -port 3001 -retries 80 -delayMs 250

if ($listenerPid -le 0) {
	Write-Host "Frontend did not open port 3001 in time."
	Stop-IfRunning -processId ([int]$frontendProc.Id) -name 'frontend-wrapper'
	throw "Frontend not reachable at http://localhost:3001"
}

$frontendPidToTrack = $frontendProc.Id
if ($listenerPid -gt 0) { $frontendPidToTrack = $listenerPid }
Write-Host "Frontend listener pid=$frontendPidToTrack (wrapper=$($frontendProc.Id))"

Write-Host "4) Starting Prisma Studio on port 5555 ..."
$studioPidToTrack = 0
$backendEnvPath = Join-Path $backendDir '.env'
if (Test-Path -LiteralPath $backendEnvPath) {
	try {
		# Start Prisma Studio as the actual Node process so the tracked PID owns port 5555.
		Import-DotEnv $backendEnvPath
		if (!$env:DATABASE_URL) {
			throw "backend/.env does not define DATABASE_URL"
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
	} catch {
		Write-Host "Skipping Prisma Studio: $($_.Exception.Message)"
	}
} else {
	Write-Host "Skipping Prisma Studio: backend/.env not found."
}

$tmpPidsFile = "${pidsFile}.tmp"
@{
	frontend = $frontendPidToTrack
	studio   = $studioPidToTrack
} | ConvertTo-Json | Set-Content -Path $tmpPidsFile -Encoding UTF8
Move-Item -Force $tmpPidsFile $pidsFile

$studioStatus = if ($studioPidToTrack -gt 0) { 'Prisma Studio: http://localhost:5555' } else { 'Prisma Studio: skipped' }
Write-Host "OK. All processes started. Backend: http://localhost:3000, Frontend: http://localhost:3001, $studioStatus"
