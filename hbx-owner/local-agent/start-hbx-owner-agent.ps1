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

if (-not $env:HBX_OWNER_LOCAL_TOKEN) {
  throw "Configure HBX_OWNER_LOCAL_TOKEN antes de iniciar."
}

Write-Host "HBX Owner Local Agent: http://127.0.0.1:3107"
node .\hbx-owner\local-agent\server.js
