# stop-hbx-engines.ps1
# Stops local HBX engine containers. App, database and fallback scraping engine stay untouched.

param(
	[int]$Count = 50
)

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$composeFile = Join-Path $scriptRoot "..\docker-compose.yml"
$ErrorActionPreference = 'Stop'

function Invoke-ExternalOrThrow([string]$filePath, [string[]]$arguments, [string]$failureMessage) {
	& $filePath @arguments
	if ($LASTEXITCODE -ne 0) {
		throw "$failureMessage Exit code: $LASTEXITCODE."
	}
}

$resolvedCount = [Math]::Min([Math]::Max($Count, 1), 50)
$services = 1..$resolvedCount | ForEach-Object { "hbx-engine-$_" }

Write-Host "Stopping HBX local engines: $($services -join ', ')"
Invoke-ExternalOrThrow -filePath 'docker' -arguments (@('compose', '-f', $composeFile, 'stop') + $services) -failureMessage 'Failed to stop HBX local engines.'
Write-Host "HBX local engines stopped."
