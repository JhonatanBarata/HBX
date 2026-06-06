$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $root

if (-not (Test-Path ".\package.json")) {
  throw "Execute a partir da raiz do HBX."
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw "Node.js nao encontrado."
}

if (-not $env:HBX_MASTER_LOCAL_TOKEN) {
  throw "Configure HBX_MASTER_LOCAL_TOKEN antes de iniciar."
}

Write-Host "HBX Master Local Agent: http://127.0.0.1:3107"
node .\hbx-master\local-agent\server.js
