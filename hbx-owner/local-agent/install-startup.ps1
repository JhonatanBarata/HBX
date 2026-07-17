param([switch]$Remove)

$ErrorActionPreference = "Stop"
$taskName = "HBX Owner Local Agent"
$launcher = Join-Path $PSScriptRoot "start-owner.ps1"

if ($Remove) {
  $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Tarefa '$taskName' removida."
  } else {
    Write-Host "Tarefa '$taskName' nao estava instalada."
  }
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

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Inicia o HBX Owner sem navegador e retoma o enriquecimento local duravel." `
  -Force | Out-Null

Write-Host "Tarefa '$taskName' instalada para o logon."
Write-Host "O worker so consome local_deep_enrich_v1 depois de confirmar target production, backend explicito e handshake do banco."
