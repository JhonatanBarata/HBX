# Sobe o HBX Owner (local-agent + painel web) e abre no navegador.
# Substitui o antigo launcher tkinter. Pode ser chamado no startup do Windows.
$ErrorActionPreference = "Stop"
$agentDir = $PSScriptRoot
$tokenFile = Join-Path $agentDir ".owner-token"

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

Start-Process "http://127.0.0.1:$port/"
Write-Host "HBX Owner em http://127.0.0.1:$port/"
