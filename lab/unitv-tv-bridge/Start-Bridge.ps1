[CmdletBinding()]
param(
    [ValidateSet('test', 'desktop', 'window')]
    [string]$Mode = 'test',
    [string]$WindowTitle = 'UniTV'
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$node = (Get-Command node).Source
$server = Join-Path $root 'bridge\server.mjs'
$log = Join-Path $root 'logs\bridge-console.log'

$existing = Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -like "*$server*" }
if (-not $existing) {
    Start-Process `
        -FilePath $node `
        -ArgumentList @($server) `
        -WorkingDirectory $root `
        -WindowStyle Hidden `
        -RedirectStandardOutput $log `
        -RedirectStandardError (Join-Path $root 'logs\bridge-error.log')
    Start-Sleep -Seconds 1
}

$query = if ($Mode -eq 'window') {
    '?mode=window&source=' + [uri]::EscapeDataString($WindowTitle)
} else {
    '?mode=' + $Mode
}

Invoke-RestMethod `
    -Method Post `
    -Uri ("http://127.0.0.1:8090/api/start$query") | Out-Null

Write-Host "Bridge iniciado em modo $Mode."
Write-Host 'TV: http://192.168.0.10:8090/live/index.m3u8'
