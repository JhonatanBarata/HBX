# stop-all.ps1
# Stop backend (docker compose), frontend (Next) and Prisma Studio background jobs

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$composeFile = Join-Path $scriptRoot "..\docker-compose.yml"
$orchestratorDir = Join-Path $scriptRoot "..\.orchestrator"
$pidsFile = Join-Path $orchestratorDir "pids.json"

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
        Write-Host "Stopping frontend (pid=$($pids.frontend)), prisma-studio (pid=$($pids.studio)) and webwhats (pid=$($pids.webwhats)) if running..."
        Stop-IfRunning -processId (Resolve-PidValue $pids.webwhats) -name 'webwhats'
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

# (PID handling performed above before docker compose down)

# Ports used by Webwhats, frontend (Next) and Prisma Studio
# Ensure any remaining Node processes on these ports are stopped (be conservative)
$ports = @(8080,3001,5555)
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

Write-Host "stop-all complete."
