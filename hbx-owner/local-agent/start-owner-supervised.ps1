param([switch]$NoBrowser)

$ErrorActionPreference = "Stop"
$agentDir = $PSScriptRoot
$launcher = Join-Path $agentDir "start-owner.ps1"
$tunnelSupervisor = Join-Path $agentDir "ensure-local-enrichment-tunnel.ps1"

function Read-DotenvValue {
  param([string]$Path, [string]$Key)
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  $escapedKey = [regex]::Escape($Key)
  $line = Select-String -LiteralPath $Path -Pattern "^\s*$escapedKey\s*=" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $line) { return $null }
  $value = ($line.Line -replace "^\s*$escapedKey\s*=", "").Trim()
  if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
    return $value.Substring(1, $value.Length - 2)
  }
  return $value
}

function Import-LocalAgentEnvironment {
  $path = Join-Path $agentDir ".env.local"
  $allowed = @(
    "HBX_OWNER_BACKEND_URL", "HBX_OWNER_BACKEND_TOKEN", "HBX_OWNER_OLLAMA_URL",
    "HBX_LOCAL_DEEP_ENABLED", "HBX_LOCAL_DEEP_TARGET", "HBX_LOCAL_DEEP_PRIVATE_TUNNEL",
    "HBX_LOCAL_DEEP_WORKER_ID", "HBX_LOCAL_DEEP_MODEL", "HBX_LOCAL_DEEP_POLL_BASE_MS",
    "HBX_LOCAL_DEEP_POLL_CAP_MS", "HBX_LOCAL_DEEP_LEASE_TTL_SECONDS",
    "HBX_LOCAL_DEEP_LAB_TIMEOUT_MS", "HBX_LOCAL_DEEP_MODEL_TIMEOUT_MS",
    "HBX_LOCAL_DEEP_MAX_FAILURES", "HBX_LOCAL_ENRICH_DATABASE_URL",
    "HBX_LOCAL_ENRICH_EXPECTED_DATABASE", "HBX_LOCAL_ENRICH_DB_SSL",
    "HBX_LOCAL_ENRICH_DB_ALLOW_SELF_SIGNED", "HBX_LOCAL_ENRICH_PRIVATE_CHANNEL_CONFIRMED"
  )
  foreach ($key in $allowed) {
    if (Test-Path "Env:$key") { continue }
    $value = Read-DotenvValue -Path $path -Key $key
    if ($null -ne $value -and [string]$value -ne "") {
      [Environment]::SetEnvironmentVariable($key, [string]$value, "Process")
    }
  }
}

function Start-TunnelSupervisor {
  $enabled = @("1", "true", "yes", "sim", "on") -contains ([string]$env:HBX_LOCAL_DEEP_PRIVATE_TUNNEL).Trim().ToLowerInvariant()
  if (-not $enabled -or ([string]$env:HBX_LOCAL_DEEP_TARGET).Trim().ToLowerInvariant() -ne "production") { return }
  $powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
  Start-Process -WindowStyle Hidden -FilePath $powershell -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", $tunnelSupervisor
  ) | Out-Null
}

function Test-OwnerAlive {
  $port = if ($env:HBX_OWNER_LOCAL_AGENT_PORT) { $env:HBX_OWNER_LOCAL_AGENT_PORT } else { "3107" }
  if (-not $env:HBX_OWNER_LOCAL_TOKEN) {
    $tokenFile = Join-Path $agentDir ".owner-token"
    if (Test-Path -LiteralPath $tokenFile) { $env:HBX_OWNER_LOCAL_TOKEN = (Get-Content -LiteralPath $tokenFile -Raw).Trim() }
  }
  if (-not $env:HBX_OWNER_LOCAL_TOKEN) { return $false }
  try {
    Invoke-RestMethod -Uri "http://127.0.0.1:$port/health" -Headers @{ Authorization = "Bearer $($env:HBX_OWNER_LOCAL_TOKEN)" } -TimeoutSec 2 | Out-Null
    return $true
  } catch { return $false }
}

$mutex = New-Object System.Threading.Mutex($false, "Local\HBXOwnerSupervisor")
if (-not $mutex.WaitOne(0)) { exit 0 }

try {
  Import-LocalAgentEnvironment
  $cycle = 0
  while ($true) {
    if (($cycle % 4) -eq 0) { Start-TunnelSupervisor }
    if (-not (Test-OwnerAlive)) {
      & $launcher -NoBrowser
    }
    $cycle += 1
    Start-Sleep -Seconds 15
  }
} finally {
  try { $mutex.ReleaseMutex() } catch {}
  $mutex.Dispose()
}
