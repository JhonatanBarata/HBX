# stop-hbx-engines.ps1
# Stops local HBX engine containers. App, database and fallback scraping engine stay untouched.

param(
	[int]$Count = 0
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

function Resolve-EngineCount([int]$requested) {
	if ($requested -gt 0) { return [Math]::Min([Math]::Max($requested, 1), 50) }
	$fromEnv = [string]$env:HBX_LOCAL_ENGINE_COUNT
	$parsed = 0
	if ([int]::TryParse($fromEnv, [ref]$parsed) -and $parsed -gt 0) {
		return [Math]::Min([Math]::Max($parsed, 1), 50)
	}
	return 3
}

$resolvedCount = Resolve-EngineCount $Count
$services = 1..$resolvedCount | ForEach-Object { "hbx-engine-$_" }

Write-Host "Stopping HBX local engines: $($services -join ', ')"
Invoke-ExternalOrThrow -filePath 'docker' -arguments (@('compose', '-f', $composeFile, 'stop') + $services) -failureMessage 'Failed to stop HBX local engines.'
Write-Host "HBX local engines stopped."
