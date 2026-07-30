# === HBX OWNER - LIGAR TUDO ========================================================================
# Um comando que deixa o painel :3107 100% funcional a partir da maquina FRIA. Nasceu em 30/07 porque
# o atalho antigo ("HBX Owner.url") so ABRIA a URL: com o Docker Desktop fechado o painel subia
# mostrando "Ops Control parado nesta maquina" e o dono nao tinha um botao pra resolver.
#
# ATENCAO ao editar: PowerShell 5.1 le .ps1 como ANSI. Este arquivo e ASCII PURO de proposito
# (sem acento, sem travessao) - foi assim que os outros scripts do repo foram escritos. Um "-" longo
# ou um "a" com acento aqui vira mojibake e QUEBRA O PARSER inteiro, nao so a linha.
#
# Ordem (cada passo so roda se o anterior deixou), tudo IDEMPOTENTE - pode rodar quantas vezes quiser:
#   1. Docker Desktop         -> sem ele nao existe ops-control, logo o painel nao ve a VPS
#   2. hbx-ops-control :3099  -> a ponte SSH que da a verdade da VPS ao painel
#   3. Ollama :11434          -> motor do 30B (so o servico; o MODELO nao e carregado aqui)
#   4. Agent/supervisor :3107 -> serve o painel e mantem tudo de pe
#   5. Abre o painel no Chrome
#
# O QUE ESTE SCRIPT NAO FAZ, DE PROPOSITO:
#  - NAO chama `npm run up`: aquele script sobe Webwhats junto, e mexer em chip de WhatsApp e acao
#    LIVE irreversivel (chip banido nao tem git revert). Aqui so sobe o que o PAINEL precisa.
#  - NAO carrega o modelo 30B na RAM (~17GB). Isso e o interruptor "IA 30B" do painel, decisao do
#    dono na hora - e o script avisa quando a RAM livre nao comporta.
#
# Uso:  .\ligar-tudo.ps1             (liga tudo e abre o painel)
#       .\ligar-tudo.ps1 -SemPainel  (liga tudo, nao abre o navegador)

param([switch]$SemPainel)

$ErrorActionPreference = "Stop"
$agentDir = $PSScriptRoot
$repoRoot = Resolve-Path (Join-Path $agentDir "..\..")
$falhas = @()
$avisos = @()

function Passo { param([string]$Texto) Write-Host ""; Write-Host "==> $Texto" -ForegroundColor Cyan }
function OK    { param([string]$Texto) Write-Host "    [ok] $Texto" -ForegroundColor Green }
function Falha { param([string]$Texto) Write-Host "    [FALHOU] $Texto" -ForegroundColor Red; $script:falhas += $Texto }
function Aviso { param([string]$Texto) Write-Host "    [aviso] $Texto" -ForegroundColor Yellow; $script:avisos += $Texto }

function Test-PortaViva {
  param([int]$Porta)
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $ok = $c.ConnectAsync("127.0.0.1", $Porta).Wait(1200)
    $c.Close()
    return $ok
  } catch { return $false }
}

function Test-DockerPronto {
  try {
    docker info --format "{{.ServerVersion}}" 2>$null | Out-Null
    return ($LASTEXITCODE -eq 0)
  } catch { return $false }
}

function Get-OwnerPort {
  if ($env:HBX_OWNER_LOCAL_AGENT_PORT) { return [int]$env:HBX_OWNER_LOCAL_AGENT_PORT }
  $envFile = Join-Path $agentDir ".env.local"
  if (Test-Path -LiteralPath $envFile) {
    $line = Select-String -LiteralPath $envFile -Pattern '^\s*HBX_OWNER_LOCAL_AGENT_PORT\s*=' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($line) {
      $v = ($line.Line -replace '^\s*HBX_OWNER_LOCAL_AGENT_PORT\s*=', '').Trim().Trim('"').Trim("'")
      if ($v) { return [int]$v }
    }
  }
  return 3107
}

$ownerPort = Get-OwnerPort

Write-Host ""
Write-Host "  HBX OWNER - LIGAR TUDO" -ForegroundColor White
Write-Host "  painel: http://127.0.0.1:$ownerPort/" -ForegroundColor DarkGray

# --- 1. Docker Desktop ----------------------------------------------------------------------------
Passo "Docker Desktop (necessario pro Ops Control e pelos motores)"
$dockerPronto = Test-DockerPronto

if ($dockerPronto) {
  OK "ja estava rodando"
} else {
  $exe = @(
    "C:\Program Files\Docker\Docker\Docker Desktop.exe",
    (Join-Path $env:LOCALAPPDATA "Docker\Docker Desktop.exe")
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1

  if (-not $exe) {
    Falha "Docker Desktop nao encontrado - instale ou ajuste o caminho neste script."
  } else {
    Write-Host "    abrindo o Docker Desktop... (costuma levar 1-2 min na primeira vez)"
    Start-Process -FilePath $exe -ArgumentList "-Autostart"
    $limite = (Get-Date).AddMinutes(3)
    do {
      Start-Sleep -Seconds 5
      $dockerPronto = Test-DockerPronto
      if (-not $dockerPronto) { Write-Host "    ...aguardando o motor do Docker" -ForegroundColor DarkGray }
    } while (-not $dockerPronto -and (Get-Date) -lt $limite)

    if ($dockerPronto) { OK "motor do Docker respondendo" }
    else { Falha "Docker Desktop nao ficou pronto em 3 min - abra na mao e rode de novo." }
  }
}

# --- 2. ops-control :3099 -------------------------------------------------------------------------
Passo "Ops Control :3099 (a ponte que da a verdade da VPS ao painel)"
if (-not $dockerPronto) {
  Falha "pulado - depende do Docker."
} else {
  $estado = (docker inspect -f "{{.State.Status}}" hbx-ops-control 2>$null)
  if ($LASTEXITCODE -ne 0 -or -not $estado) {
    # Container nunca criado nesta maquina: sobe pelo compose. O --env-file NAO e opcional - sem ele
    # o container entra em crash-loop com "OPS_CONTROL_TOKEN e obrigatorio".
    Write-Host "    container nao existe; criando pelo compose..."
    $envFile = Join-Path $repoRoot ".env.ops-control"
    if (-not (Test-Path -LiteralPath $envFile)) {
      Falha "falta o arquivo .env.ops-control na raiz do projeto (guarda o OPS_CONTROL_TOKEN)."
    } else {
      Push-Location $repoRoot
      try {
        docker network create hbx_net 2>$null | Out-Null   # idempotente: se ja existe, ignora
        docker compose --env-file .env.ops-control -f docker-compose.ops.yml up -d ops-control 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { OK "container criado" } else { Falha "compose up do ops-control falhou." }
      } finally { Pop-Location }
    }
  } elseif ($estado -ne "running") {
    docker start hbx-ops-control 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { OK "container religado (estava '$estado')" } else { Falha "nao consegui religar o hbx-ops-control." }
  } else {
    OK "ja estava rodando"
  }

  # Verdade verificada: container "running" nao prova porta ouvindo (pode estar em crash-loop).
  $limite = (Get-Date).AddSeconds(45)
  $vivo = $false
  do {
    $vivo = Test-PortaViva -Porta 3099
    if (-not $vivo) { Start-Sleep -Seconds 3 }
  } while (-not $vivo -and (Get-Date) -lt $limite)
  if ($vivo) { OK ":3099 respondendo" }
  else { Falha ":3099 nao respondeu - veja 'docker logs hbx-ops-control'." }
}

# --- 3. Ollama :11434 -----------------------------------------------------------------------------
Passo "Ollama :11434 (motor do 30B - so o servico, sem carregar modelo)"
if (Test-PortaViva -Porta 11434) {
  OK "ja estava rodando"
} else {
  $ollama = Get-Command "ollama.exe" -ErrorAction SilentlyContinue
  if (-not $ollama) {
    Aviso "ollama.exe nao esta no PATH - o interruptor 'IA 30B' do painel fica sem motor."
  } else {
    Start-Process -WindowStyle Hidden -FilePath $ollama.Source -ArgumentList "serve"
    $limite = (Get-Date).AddSeconds(30)
    do { Start-Sleep -Seconds 2 } while (-not (Test-PortaViva -Porta 11434) -and (Get-Date) -lt $limite)
    if (Test-PortaViva -Porta 11434) { OK "subiu" } else { Falha "Ollama nao respondeu em 30s." }
  }
}

# --- 4. Agent + supervisor :3107 ------------------------------------------------------------------
Passo "Agent do Owner :$ownerPort (serve o painel e vigia o resto)"
if (Test-PortaViva -Porta $ownerPort) {
  OK "ja estava rodando"
} else {
  $supervisor = Join-Path $agentDir "start-owner-supervised.ps1"
  if (-not (Test-Path -LiteralPath $supervisor)) {
    Falha "start-owner-supervised.ps1 nao encontrado em $agentDir."
  } else {
    # -NoBrowser aqui porque QUEM abre o painel e o passo 5 (uma aba so, no Chrome).
    Start-Process -WindowStyle Hidden -FilePath "powershell.exe" `
      -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$supervisor`"", "-NoBrowser" `
      -WorkingDirectory $agentDir
    $limite = (Get-Date).AddSeconds(90)
    do { Start-Sleep -Seconds 3 } while (-not (Test-PortaViva -Porta $ownerPort) -and (Get-Date) -lt $limite)
    if (Test-PortaViva -Porta $ownerPort) { OK "subiu" } else { Falha "agent nao respondeu em 90s." }
  }
}

# --- 5. Painel no Chrome --------------------------------------------------------------------------
$url = "http://127.0.0.1:$ownerPort/"
if ($SemPainel) {
  Passo "Painel"
  OK "nao abri (-SemPainel). Abra quando quiser: $url"
} elseif (Test-PortaViva -Porta $ownerPort) {
  Passo "Abrindo o painel no Chrome"
  $chrome = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe")
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
  if ($chrome) { Start-Process -FilePath $chrome -ArgumentList $url; OK "aberto no Chrome" }
  else { Start-Process $url; Aviso "Chrome nao encontrado; abri no navegador padrao." }
}

# --- Resumo honesto (o painel tem a Faixa de Problemas; aqui e o resumo do LIGAR) ------------------
Write-Host ""
Write-Host "---------------------------------------------------------" -ForegroundColor DarkGray
if ($falhas.Count -eq 0) {
  Write-Host "  TUDO LIGADO." -ForegroundColor Green
} else {
  Write-Host "  LIGOU COM $($falhas.Count) FALHA(S):" -ForegroundColor Red
  $falhas | ForEach-Object { Write-Host "   - $_" -ForegroundColor Red }
}
if ($avisos.Count -gt 0) {
  Write-Host "  avisos:" -ForegroundColor Yellow
  $avisos | ForEach-Object { Write-Host "   - $_" -ForegroundColor Yellow }
}

# RAM: o 30B pesa ~17GB. Avisar ANTES do dono clicar e melhor do que ele descobrir a maquina travando.
try {
  $os = Get-CimInstance Win32_OperatingSystem
  $livreGb = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
  if ($livreGb -lt 19) {
    Write-Host "  RAM livre: $livreGb GB - o 30B pede ~17GB. Ligar a 'IA 30B' agora pode travar a maquina." -ForegroundColor Yellow
  } else {
    Write-Host "  RAM livre: $livreGb GB - da pra ligar a 'IA 30B' no painel." -ForegroundColor DarkGray
  }
} catch {}

Write-Host "  Painel: $url" -ForegroundColor DarkGray
Write-Host "---------------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""

if ($falhas.Count -gt 0) { exit 1 }
