param([switch]$Remove)

$ErrorActionPreference = "Stop"
$taskName = "HBX Owner Local Agent"
$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$runName = "HBXOwnerLocalAgent"
$launcher = Join-Path $PSScriptRoot "start-owner-supervised.ps1"

if ($Remove) {
  $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Tarefa '$taskName' removida."
  } else {
    Write-Host "Tarefa '$taskName' nao estava instalada."
  }
  Remove-ItemProperty -Path $runKey -Name $runName -ErrorAction SilentlyContinue
  exit 0
}

if (-not (Test-Path -LiteralPath $launcher)) {
  throw "Launcher nao encontrado: $launcher"
}

$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`" -NoBrowser"
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

try {
  Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Inicia o HBX Owner sem navegador e retoma o enriquecimento local duravel." `
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
Write-Host "O supervisor mantem Owner e tunel privado ativos; o worker so consome depois do handshake do banco."
