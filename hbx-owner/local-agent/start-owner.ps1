# Sobe o HBX Owner (local-agent + painel web) e abre no navegador.
# Substitui o antigo launcher tkinter. Pode ser chamado no startup do Windows.
# -NoBrowser: sobe o agent sem abrir a aba (usado pelo `npm run up`).
param([switch]$NoBrowser)
$ErrorActionPreference = "Stop"
$agentDir = $PSScriptRoot
$tokenFile = Join-Path $agentDir ".owner-token"

function Read-DotenvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Key
  )

  if (-not (Test-Path $Path)) { return $null }
  $escapedKey = [regex]::Escape($Key)
  $line = Select-String -Path $Path -Pattern "^\s*$escapedKey\s*=" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $line) { return $null }

  $value = ($line.Line -replace "^\s*$escapedKey\s*=", "").Trim()
  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  return $value
}

# Token local: usa o do ambiente ou gera/persiste um (gitignored).
if (-not $env:HBX_OWNER_LOCAL_TOKEN) {
  if (-not (Test-Path $tokenFile)) {
    [guid]::NewGuid().ToString("N") | Set-Content $tokenFile -NoNewline -Encoding ascii
  }
  $env:HBX_OWNER_LOCAL_TOKEN = (Get-Content $tokenFile -Raw).Trim()
}

# Ponte VPS: o agent fala com o Ops Control (que já tem SSH). Se o token não veio do
# ambiente, lê o OPS_CONTROL_TOKEN do .env.ops-control da raiz (gitignored). Sem segredo novo.
if (-not $env:HBX_OWNER_OPS_TOKEN) {
  $opsEnv = Join-Path $agentDir "..\..\.env.ops-control"
  if (Test-Path $opsEnv) {
    $line = Select-String -Path $opsEnv -Pattern '^\s*OPS_CONTROL_TOKEN\s*=' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($line) { $env:HBX_OWNER_OPS_TOKEN = ($line.Line -replace '^\s*OPS_CONTROL_TOKEN\s*=', '').Trim() }
  }
}

# Backend: o agent precisa de um Bearer JWT, nao da senha em texto puro.
# Se o token nao veio pronto, tenta obter um JWT do backend local com o master de backend/.env.
if (-not $env:HBX_OWNER_BACKEND_TOKEN) {
  $rootDir = Resolve-Path (Join-Path $agentDir "..\..")
  $backendEnv = Join-Path $rootDir "backend\.env"
  $backendUrl = if ($env:HBX_OWNER_BACKEND_URL) { $env:HBX_OWNER_BACKEND_URL } else { "http://127.0.0.1:3000" }
  $masterUsername = Read-DotenvValue -Path $backendEnv -Key "SYSTEM_MASTER_USERNAME"
  $masterPassword = Read-DotenvValue -Path $backendEnv -Key "SYSTEM_MASTER_PASSWORD"

  if ($masterUsername -and $masterPassword) {
    try {
      $loginBody = @{
        username = $masterUsername
        password = $masterPassword
        forceSession = $true
      } | ConvertTo-Json
      $login = Invoke-RestMethod -Method Post -Uri "$backendUrl/auth/login" -ContentType "application/json" -Body $loginBody -TimeoutSec 5
      if ($login.access_token) {
        $env:HBX_OWNER_BACKEND_URL = $backendUrl
        $env:HBX_OWNER_BACKEND_TOKEN = [string]$login.access_token
      }
    } catch {
      Write-Warning "Nao foi possivel obter HBX_OWNER_BACKEND_TOKEN automaticamente. Verifique backend local, SYSTEM_MASTER_USERNAME e SYSTEM_MASTER_PASSWORD."
    }
  }
}

$port = if ($env:HBX_OWNER_LOCAL_AGENT_PORT) { $env:HBX_OWNER_LOCAL_AGENT_PORT } else { "3107" }

# Se já está no ar, só abre o navegador; senão, sobe o agent.
$up = $false
try {
  Invoke-RestMethod -Uri "http://127.0.0.1:$port/health" -Headers @{ Authorization = "Bearer $($env:HBX_OWNER_LOCAL_TOKEN)" } -TimeoutSec 2 | Out-Null
  $up = $true
} catch {}

if (-not $up) {
  Start-Process -WindowStyle Hidden -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $agentDir
  Start-Sleep -Seconds 2
}

if (-not $NoBrowser) { Start-Process "http://127.0.0.1:$port/" }
Write-Host "HBX Owner em http://127.0.0.1:$port/"
