$ErrorActionPreference = "Stop"

# Exemplo: nao executa instalacao automatica.
# Ajuste o caminho e rode manualmente se quiser criar uma tarefa no Windows.

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$script = Join-Path $root "hbx-owner\local-agent\start-owner-supervised.ps1"

Write-Host "Exemplo de comando para criar startup manual (painel abre sozinho apos o /health, padrao E4):"
Write-Host "powershell -NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $PSScriptRoot 'install-startup.ps1')`""
Write-Host "Acao registrada (padrao, painel abre): powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
Write-Host ""
Write-Host "Para instalar sem abrir o painel sozinho, use -SemPainel:"
Write-Host "powershell -NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $PSScriptRoot 'install-startup.ps1')`" -SemPainel"
Write-Host "Acao registrada (-SemPainel): powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" -NoBrowser"
