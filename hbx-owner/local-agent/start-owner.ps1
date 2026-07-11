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

# ---- Passo 1 (S1): garantir o Ops Control (:3099) de pé ----
# A coluna VPS inteira do painel (configs/integrações, pressão, motores, banco) depende do container
# hbx-ops-control. Ele morreu calado em 04/07 (D1) e nada o religa. Aqui o `npm run up` passa a cobri-lo.
# LEI: nunca derruba o up — qualquer tropeço vira warning e segue (painel degrada com aviso, como hoje).

function Test-OpsControlAlive {
  param([int]$Port = 3099)
  try {
    Invoke-RestMethod -Uri "http://127.0.0.1:$Port/" -TimeoutSec 2 -ErrorAction Stop | Out-Null
    return $true   # 2xx
  } catch {
    # Se veio RESPOSTA HTTP (mesmo 401/404/500), o processo está VIVO e ouvindo. Sem resposta = recusou = morto.
    if ($_.Exception.Response) { return $true }
    return $false
  }
}

# ---- S3 (D4): anti-drift da imagem do Ops Control ----
# Hash do ÚLTIMO commit que tocou ops-control/ — a MESMA régua que a imagem grava no build (BUILD_GIT_HASH).
# Casa iff a imagem foi buildada com o ops-control/ atual. $null se não for repo git (então não afirma drift).
function Get-OpsLocalHash {
  param([Parameter(Mandatory = $true)][string]$Root)
  try {
    $h = & git -C $Root log -1 --format=%h -- ops-control 2>$null | Select-Object -First 1
    if ($h) { return ([string]$h).Trim() }
  } catch {}
  return $null
}

# Hash gravado na imagem RODANDO (GET /api/build-info, atrás do token). $null se Ops Control antigo/off.
function Get-OpsBuildHash {
  param([int]$Port = 3099)
  try {
    $headers = @{}
    if ($env:HBX_OWNER_OPS_TOKEN) { $headers["Authorization"] = "Bearer $($env:HBX_OWNER_OPS_TOKEN)" }
    $bi = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/build-info" -Headers $headers -TimeoutSec 3 -ErrorAction Stop
    if ($bi -and $bi.gitHash) { return [string]$bi.gitHash }
  } catch {}
  return $null
}

# docker compose up -d (opcional --build). Nunca lança: erro vira warning e devolve $false (não derruba o up).
function Invoke-OpsCompose {
  param(
    [Parameter(Mandatory = $true)][string]$EnvFile,
    [Parameter(Mandatory = $true)][string]$Compose,
    [switch]$Build
  )
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'   # docker compose escreve progresso no stderr; 2>&1 sob Stop viraria erro
  $code = 1
  try {
    if ($Build) {
      & docker compose --env-file $EnvFile -f $Compose up -d --build 2>&1 | Out-Host
    } else {
      & docker compose --env-file $EnvFile -f $Compose up -d 2>&1 | Out-Host
    }
    $code = $LASTEXITCODE
  } catch {
    Write-Warning "Ops Control: falha no docker compose ($($_.Exception.Message)). Seguindo sem derrubar o up."
    return $false
  } finally {
    $ErrorActionPreference = $prevEap
  }
  if ($code -ne 0) {
    Write-Warning "Ops Control: 'docker compose up -d' saiu com codigo $code. Painel degrada; seguindo."
    return $false
  }
  return $true
}

# Se a imagem rodando está atrás do código de ops-control/, rebuilda (docker cacheia camadas → segundos
# quando nada mudou). Nunca derruba o up. Só age quando há hash local E build-info coerentes que divergem.
function Rebuild-OpsIfDrift {
  param(
    [Parameter(Mandatory = $true)][string]$EnvFile,
    [Parameter(Mandatory = $true)][string]$Compose,
    [string]$LocalHash
  )
  if (-not $LocalHash) { return }
  $buildHash = Get-OpsBuildHash
  if ($buildHash -and $buildHash -ne "unknown" -and $buildHash -ne $LocalHash) {
    Write-Host "Ops Control DESATUALIZADO (imagem $buildHash != codigo $LocalHash) — rebuild com --build ..."
    [void](Invoke-OpsCompose -EnvFile $EnvFile -Compose $Compose -Build)
    for ($i = 0; $i -lt 20; $i++) { if (Test-OpsControlAlive) { break }; Start-Sleep -Seconds 1 }
  }
}

function Ensure-OpsControl {
  $root = (Resolve-Path (Join-Path $agentDir "..\..")).Path
  $opsEnvFile = Join-Path $root ".env.ops-control"
  $opsCompose = Join-Path $root "docker-compose.ops.yml"

  # Sem .env.ops-control → não dá pra subir; segue como hoje (painel degrada com aviso).
  if (-not (Test-Path -LiteralPath $opsEnvFile)) {
    Write-Warning "Ops Control: .env.ops-control nao encontrado ($opsEnvFile) — coluna VPS do painel degrada. Seguindo."
    return
  }
  if (-not (Test-Path -LiteralPath $opsCompose)) {
    Write-Warning "Ops Control: docker-compose.ops.yml nao encontrado ($opsCompose). Seguindo sem subir o ops."
    return
  }

  # S3 (D4): exporta o hash do codigo de ops-control/ + instante do build → o compose grava na imagem
  # (BUILD_GIT_HASH/BUILD_AT) sempre que buildar. Env de shell tem precedencia na interpolacao do compose.
  $localHash = Get-OpsLocalHash -Root $root
  if ($localHash) {
    $env:OPS_BUILD_GIT_HASH = $localHash
    $env:OPS_BUILD_AT = (Get-Date).ToUniversalTime().ToString("o")
  }

  # Já no ar? (qualquer status HTTP em :3099 = vivo)
  if (Test-OpsControlAlive) {
    Write-Host "Ops Control ja no ar em http://127.0.0.1:3099."
    # S3 (D4): mesmo de pé, a imagem pode estar atrás do codigo. Se houver drift, rebuild (cache de camadas
    # → segundos quando nada mudou). Precisa do docker; sem ele, apenas segue (o agent avisa o drift no painel).
    if (Get-Command docker -ErrorAction SilentlyContinue) {
      Rebuild-OpsIfDrift -EnvFile $opsEnvFile -Compose $opsCompose -LocalHash $localHash
    }
    return
  }

  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Warning "Ops Control morto e docker nao encontrado no PATH — nao da pra religar. Seguindo."
    return
  }

  # Sobe SEM --build (caminho quente; se a imagem nao existir, o compose builda sozinho e ja grava o hash).
  # Sem exigir admin — docker roda sem elevacao aqui.
  Write-Host "Ops Control morto: subindo hbx-ops-control (docker compose up -d) ..."
  if (-not (Invoke-OpsCompose -EnvFile $opsEnvFile -Compose $opsCompose)) { return }

  # Espera a porta ~20s; nao subiu → warning e segue (nao derruba o up por causa do cockpit VPS).
  $alive = $false
  for ($i = 0; $i -lt 20; $i++) {
    if (Test-OpsControlAlive) { $alive = $true; break }
    Start-Sleep -Seconds 1
  }
  if ($alive) {
    Write-Host "Ops Control no ar em http://127.0.0.1:3099."
    # S3 (D4): imagem existente pode estar velha (up -d sem build reusa a cacheada) → checa drift e rebuild.
    Rebuild-OpsIfDrift -EnvFile $opsEnvFile -Compose $opsCompose -LocalHash $localHash
  } else {
    Write-Warning "Ops Control nao respondeu :3099 em ~20s. Pode estar buildando/subindo; o auto-heal do agent segue de olho. Seguindo."
  }
}

try { Ensure-OpsControl } catch { Write-Warning "Ops Control: passo pulado ($($_.Exception.Message)). Seguindo." }

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
