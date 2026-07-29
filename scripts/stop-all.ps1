# stop-all.ps1
# Stop backend (docker compose), frontend (Next) and Prisma Studio background jobs

param(
    [switch]$KeepEngines,
    [int]$EngineCount = 0
)

$startedAt = Get-Date
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$composeFile = Join-Path $scriptRoot "..\docker-compose.yml"
$orchestratorDir = Join-Path $scriptRoot "..\.orchestrator"
$pidsFile = Join-Path $orchestratorDir "pids.json"
$stopEnginesScript = Join-Path $scriptRoot "stop-hbx-engines.ps1"

function Stop-IfRunning([int]$processId, [string]$name) {
    if (!$processId) { return }
    try {
        $proc = Get-Process -Id $processId -ErrorAction Stop
        if ($null -ne $proc) {
            Write-Host "Stopping $name pid=$processId ..."
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

function Resolve-PidValue($value) {
    if ($null -eq $value) { return 0 }
    if ($value -is [array]) {
        for ($i = $value.Count - 1; $i -ge 0; $i--) {
            $resolved = Resolve-PidValue $value[$i]
            if ($resolved -gt 0) { return $resolved }
        }
        return 0
    }
    try {
        return [int]$value
    } catch {
        return 0
    }
}

function Test-EnvTruthy([string]$value) {
    if ([string]::IsNullOrWhiteSpace($value)) { return $false }
    return $value.Trim().ToLowerInvariant() -in @('1', 'true', 'yes', 'y', 'on', 'sim')
}

function Resolve-EngineCount([int]$requested) {
    if ($requested -gt 0) { return [Math]::Min([Math]::Max($requested, 1), 50) }
    $fromEnv = [string]$env:HBX_DOWN_ENGINE_COUNT
    if ([string]::IsNullOrWhiteSpace($fromEnv)) { $fromEnv = [string]$env:HBX_LOCAL_ENGINE_COUNT }
    $parsed = 0
    if ([int]::TryParse($fromEnv, [ref]$parsed) -and $parsed -gt 0) {
        return [Math]::Min([Math]::Max($parsed, 1), 50)
    }
    return 3
}

function Format-Elapsed([datetime]$start) {
    $elapsed = (Get-Date) - $start
    if ($elapsed.TotalMinutes -ge 1) {
        return ("{0}m{1:00}s" -f [int]$elapsed.TotalMinutes, $elapsed.Seconds)
    }
    return ("{0}s" -f [Math]::Max(0, [int]$elapsed.TotalSeconds))
}

$shouldStopEngines = (-not $KeepEngines.IsPresent) -and (-not (Test-EnvTruthy ([string]$env:HBX_DOWN_KEEP_ENGINES)))
$resolvedEngineCount = Resolve-EngineCount $EngineCount
$engineSummary = if ($shouldStopEngines) { "stop ate $resolvedEngineCount" } else { 'mantidos' }

Write-Host "=== npm run down ASAP ==="
Write-Host "App local: frontend/studio + docker compose down. Webwhats nao sobe local (motor roda na VPS, fora do up/down)."
Write-Host "Motores dedicados: $engineSummary."

Write-Host "Stopping orchestrated processes (wrapper, frontend, studio) if present..."

# First: stop wrapper/frontend/studio processes recorded in pids file
if (Test-Path $pidsFile) {
    $pids = $null
    try {
        $pids = Get-Content $pidsFile -Raw | ConvertFrom-Json
    } catch {
        Write-Host "Could not parse $pidsFile ($($_.Exception.Message)). Removing it and continuing..."
        Remove-Item -Force $pidsFile -ErrorAction SilentlyContinue
    }

    if ($null -ne $pids) {
        Write-Host "Stopping frontend (pid=$($pids.frontend)) and prisma-studio (pid=$($pids.studio)) if running..."
        Stop-IfRunning -processId (Resolve-PidValue $pids.owner) -name 'hbx-owner'
        Stop-IfRunning -processId (Resolve-PidValue $pids.studio) -name 'prisma-studio'
        Stop-IfRunning -processId (Resolve-PidValue $pids.frontend) -name 'frontend'
        # remove pid file now that we've attempted to stop these processes
        Remove-Item -Force $pidsFile -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "No orchestrator pids file found; skipping explicit process stop."
}

Write-Host "Stopping backend (docker compose down) using $composeFile ..."
try {
    docker compose -f $composeFile down
} catch {
    Write-Host "docker compose down failed (Docker may be stopped). Continuing..."
}

if ($shouldStopEngines) {
    Write-Host "Stopping dedicated HBX engine warm pool if present..."
    try {
        if (Test-Path -LiteralPath $stopEnginesScript) {
            & powershell -NoProfile -ExecutionPolicy Bypass -File $stopEnginesScript -Count $resolvedEngineCount
        } else {
            Write-Host "stop-hbx-engines.ps1 not found; skipping dedicated engine cleanup."
        }
    } catch {
        Write-Host "Dedicated engine cleanup failed or Docker is stopped. Continuing..."
    }
} else {
    Write-Host "Keeping dedicated HBX engines by request."
}

# (PID handling performed above before docker compose down)

# Ports used by frontend (Next), Prisma Studio and HBX Owner
# Ensure any remaining Node processes on these ports are stopped (be conservative)
# (8080 removido: Webwhats nao sobe local, roda na VPS como webwhats.service, fora do up/down)
$ports = @(3001,5555,3107)
foreach ($p in $ports) {
    Write-Host "Checking for processes listening on port $p ..."
    try {
        $conns = Get-NetTCPConnection -LocalPort $p -ErrorAction Stop
        foreach ($c in $conns) {
            $pid = $c.OwningProcess
            if ($pid) {
                $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
                if ($null -ne $proc -and $proc.ProcessName -in @('node', 'npm')) {
                    Write-Host "Stopping process $pid ($($proc.ProcessName)) listening on port $p"
                    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                } else {
                    Write-Host "Skipping process $pid (not node/npm) on port $p"
                }
            }
        }
    } catch {
        # no listeners on that port
    }
}

Write-Host "stop-all complete in $(Format-Elapsed $startedAt)."
