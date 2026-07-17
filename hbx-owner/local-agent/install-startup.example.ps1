$ErrorActionPreference = "Stop"

# Exemplo: nao executa instalacao automatica.
# Ajuste o caminho e rode manualmente se quiser criar uma tarefa no Windows.

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$script = Join-Path $root "hbx-owner\local-agent\start-owner.ps1"

Write-Host "Exemplo de comando para criar startup manual:"
Write-Host "powershell -NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $PSScriptRoot 'install-startup.ps1')`""
Write-Host "Acao registrada: powershell -NoProfile -ExecutionPolicy Bypass -File `"$script`" -NoBrowser"
