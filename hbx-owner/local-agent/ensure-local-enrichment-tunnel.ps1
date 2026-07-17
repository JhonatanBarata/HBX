param()

$ErrorActionPreference = "Stop"
$agentDir = $PSScriptRoot
$rootDir = Resolve-Path (Join-Path $agentDir "..\..")

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

$localEnv = Join-Path $agentDir ".env.local"
$opsEnv = Join-Path $rootDir ".env.production.local"
$target = Read-DotenvValue -Path $localEnv -Key "HBX_LOCAL_DEEP_TARGET"
$privateTunnel = Read-DotenvValue -Path $localEnv -Key "HBX_LOCAL_DEEP_PRIVATE_TUNNEL"
$databaseUrl = Read-DotenvValue -Path $localEnv -Key "HBX_LOCAL_ENRICH_DATABASE_URL"
$sshHost = Read-DotenvValue -Path $opsEnv -Key "HOSTINGER_SSH_HOST"
$sshUser = Read-DotenvValue -Path $opsEnv -Key "HOSTINGER_SSH_USER"

if ([string]$target -ne "production" -or -not (@("1", "true", "yes", "sim", "on") -contains ([string]$privateTunnel).Trim().ToLowerInvariant())) { exit 0 }
if (-not $databaseUrl -or -not $sshHost -or -not $sshUser) { throw "Configuracao do tunel privado incompleta." }

try { $databaseUri = [Uri]$databaseUrl } catch { throw "HBX_LOCAL_ENRICH_DATABASE_URL invalida." }
if ($databaseUri.Scheme -notin @("postgres", "postgresql")) { throw "HBX_LOCAL_ENRICH_DATABASE_URL precisa usar PostgreSQL." }
if ($databaseUri.Host -notin @("127.0.0.1", "localhost", "::1")) { throw "O writer deve usar somente a ponta local do tunel privado." }
$localPort = if ($databaseUri.Port -gt 0) { $databaseUri.Port } else { 5432 }
$sshTarget = "$sshUser@$sshHost"
$ssh = (Get-Command ssh.exe -ErrorAction Stop).Source

$mutex = New-Object System.Threading.Mutex($false, "Local\HBXLocalEnrichmentTunnelSupervisor")
if (-not $mutex.WaitOne(0)) { exit 0 }

try {
  $retrySeconds = 5
  while ($true) {
    try {
      $databaseIp = (& $ssh -q -o BatchMode=yes -o ConnectTimeout=20 $sshTarget "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' hbx-postgres" 2>$null | Select-Object -First 1).Trim()
      if ($databaseIp -notmatch '^\d{1,3}(?:\.\d{1,3}){3}$') { throw "PostgreSQL da VPS indisponivel para o tunel." }
      $forward = "127.0.0.1:$localPort`:$databaseIp`:5432"
      $process = Start-Process -WindowStyle Hidden -PassThru -FilePath $ssh -ArgumentList @(
        "-q", "-N", "-T", "-o", "BatchMode=yes", "-o", "ExitOnForwardFailure=yes",
        "-o", "ConnectTimeout=20", "-o", "ServerAliveInterval=20", "-o", "ServerAliveCountMax=3",
        "-L", $forward, $sshTarget
      )
      $retrySeconds = 5
      $process.WaitForExit()
    } catch {
      $retrySeconds = [Math]::Min(60, [Math]::Max(5, $retrySeconds * 2))
    }
    Start-Sleep -Seconds $retrySeconds
  }
} finally {
  try { $mutex.ReleaseMutex() } catch {}
  $mutex.Dispose()
}
