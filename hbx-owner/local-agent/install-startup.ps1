param([switch]$Remove, [switch]$SemPainel)

$ErrorActionPreference = "Stop"
$taskName = "HBX Owner Local Agent"
$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$runName = "HBXOwnerLocalAgent"
$launcher = Join-Path $PSScriptRoot "start-owner-supervised.ps1"
$desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) "HBX Owner.url"

# Porta do agent: env do processo > .env.local > 3107 (padrao documentado em .env.example).
function Get-OwnerPort {
  if ($env:HBX_OWNER_LOCAL_AGENT_PORT) { return $env:HBX_OWNER_LOCAL_AGENT_PORT }
  $envFile = Join-Path $PSScriptRoot ".env.local"
  if (Test-Path -LiteralPath $envFile) {
    $line = Select-String -LiteralPath $envFile -Pattern '^\s*HBX_OWNER_LOCAL_AGENT_PORT\s*=' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($line) {
      $value = ($line.Line -replace '^\s*HBX_OWNER_LOCAL_AGENT_PORT\s*=', '').Trim().Trim('"').Trim("'")
      if ($value) { return $value }
    }
  }
  return "3107"
}

if ($Remove) {
  $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Tarefa '$taskName' removida."
  } else {
    Write-Host "Tarefa '$taskName' nao estava instalada."
  }
  Remove-ItemProperty -Path $runKey -Name $runName -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $desktopShortcut -ErrorAction SilentlyContinue
  exit 0
}

if (-not (Test-Path -LiteralPath $launcher)) {
  throw "Launcher nao encontrado: $launcher"
}

$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
# Abrir o painel e o PADRAO (E4, 28/07 - o dono reclamou "inicia com o Windows mas o
# painel nao abre"; a causa era este -NoBrowser fixo). -SemPainel devolve o comportamento antigo.
$arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`""
if ($SemPainel) { $arguments += " -NoBrowser" }
$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -WakeToRun `
  -RestartCount 10 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

$description = if ($SemPainel) {
  "Inicia o HBX Owner sem abrir o painel (-SemPainel) e retoma o enriquecimento local duravel."
} else {
  "Inicia o HBX Owner, abre o painel (/v3) assim que o health-check passar, e retoma o enriquecimento local duravel."
}

try {
  Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description $description `
    -Force `
    -ErrorAction Stop | Out-Null
  Remove-ItemProperty -Path $runKey -Name $runName -ErrorAction SilentlyContinue
  Write-Host "Tarefa '$taskName' instalada para o logon."
} catch {
  # Ambientes corporativos podem bloquear o Task Scheduler para usuário não elevado. O fallback
  # HKCU é por usuário, não exige administrador e mantém o mesmo supervisor oculto no próximo logon.
  New-Item -Path $runKey -Force | Out-Null
  Set-ItemProperty -Path $runKey -Name $runName -Value "`"$powershell`" $arguments"
  Write-Warning "Task Scheduler indisponivel; autostart instalado no logon do usuario atual."
}

# Atalho na Area de Trabalho: acesso manual sempre disponivel, mesmo antes do boot passar pelo
# health-check (ou quando instalado com -SemPainel). Idempotente: sobrescrever e o esperado.
try {
  $port = Get-OwnerPort
  $shortcutBody = "[InternetShortcut]`r`nURL=http://127.0.0.1:$port/v3`r`n"
  Set-Content -LiteralPath $desktopShortcut -Value $shortcutBody -Encoding ascii -Force
  Write-Host "Atalho 'HBX Owner.url' criado na Area de Trabalho (http://127.0.0.1:$port/v3)."
} catch {
  Write-Warning "Nao foi possivel criar o atalho na Area de Trabalho ($($_.Exception.Message))."
}

Write-Host "O supervisor mantem Owner e tunel privado ativos; o worker so consome depois do handshake do banco."
if ($SemPainel) {
  Write-Host "Ficou valendo: painel NAO abre sozinho no logon (-SemPainel). Use o atalho 'HBX Owner.url' na Area de Trabalho para abrir na mao."
} else {
  Write-Host "Ficou valendo: painel abre sozinho no logon, assim que o /health responder (ate 60s de espera)."
}
