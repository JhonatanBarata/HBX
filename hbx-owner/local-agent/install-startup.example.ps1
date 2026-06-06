$ErrorActionPreference = "Stop"

# Exemplo: nao executa instalacao automatica.
# Ajuste o caminho e rode manualmente se quiser criar uma tarefa no Windows.

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$script = Join-Path $root "hbx-owner\local-agent\start-hbx-owner-agent.ps1"

Write-Host "Exemplo de comando para criar startup manual:"
Write-Host "schtasks /Create /TN `"HBX Owner Local Agent`" /TR `"powershell -NoProfile -ExecutionPolicy Bypass -File $script`" /SC ONLOGON"
