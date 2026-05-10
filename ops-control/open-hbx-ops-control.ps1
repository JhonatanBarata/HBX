$ErrorActionPreference = 'Stop'

$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  Start-Process powershell.exe -Verb RunAs -ArgumentList @(
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    "`"$PSCommandPath`""
  )
  exit
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$envFile = Join-Path $repoRoot '.env.ops-control'
$composeFile = Join-Path $repoRoot 'docker-compose.ops.yml'

Set-Location $repoRoot

if (-not (Test-Path $envFile)) {
  @'
OPS_CONTROL_TOKEN=troque-por-um-token-grande
'@ | Set-Content -Encoding ASCII $envFile
  Write-Host 'Arquivo .env.ops-control criado. Edite OPS_CONTROL_TOKEN antes de usar em ambiente real.'
}

docker compose --env-file $envFile -f $composeFile up -d --build

Start-Sleep -Seconds 2
Start-Process 'http://127.0.0.1:3099'
