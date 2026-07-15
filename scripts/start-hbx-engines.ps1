# start-hbx-engines.ps1
# Starts an explicit local warm pool of HBX engines without making npm run up heavy.

param(
	[int]$Count = 0,
	[switch]$NoBackendRestart
)

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$composeFile = Join-Path $scriptRoot "..\docker-compose.yml"
$ErrorActionPreference = 'Stop'

function Resolve-EngineCount([int]$requested) {
	if ($requested -gt 0) { return $requested }
	$fromEnv = [string]$env:HBX_LOCAL_ENGINE_COUNT
	if ([string]::IsNullOrWhiteSpace($fromEnv)) { return 3 }
	$parsed = 0
	if ([int]::TryParse($fromEnv, [ref]$parsed) -and $parsed -gt 0) { return $parsed }
	return 3
}

function Invoke-ExternalOrThrow([string]$filePath, [string[]]$arguments, [string]$failureMessage) {
	& $filePath @arguments
	if ($LASTEXITCODE -ne 0) {
		throw "$failureMessage Exit code: $LASTEXITCODE."
	}
}

$resolvedCount = Resolve-EngineCount $Count
$resolvedCount = [Math]::Min([Math]::Max($resolvedCount, 1), 50)
# NÃO subir searxng: medido ao vivo 29/06, searxng LENTO (timeout 10s aglutinando bing/ddg/google
# bloqueados) e o motor o tenta PRIMEIRO → cada query espera ~10s antes do fallback → throughput
# despencou 6x (+180/min sem searxng → +31/min com). searxng DOWN (DNS-fail instantâneo) é melhor que lento.
$services = 1..$resolvedCount | ForEach-Object { "hbx-engine-$_" }
$urls = 1..$resolvedCount | ForEach-Object { "http://hbx-engine-$($_):8001" }

$env:HBX_ENGINE_COUNT = [string]$resolvedCount
$env:HBX_ENGINE_MAX_COUNT = [string]$resolvedCount
$env:HBX_LIST_ENGINE_COUNT = [string]$resolvedCount
$env:HBX_ENGINE_URLS = ($urls -join ',')

Write-Host "Starting HBX local engine warm pool: $($services -join ', ')"
Invoke-ExternalOrThrow -filePath 'docker' -arguments (@('compose', '-f', $composeFile, 'up', '-d', '--build') + $services) -failureMessage 'Failed to start HBX local engines.'

if (-not $NoBackendRestart) {
	Write-Host "Recreating backend with HBX_ENGINE_COUNT=$resolvedCount for the local warm pool ..."
	Invoke-ExternalOrThrow -filePath 'docker' -arguments @('compose', '-f', $composeFile, 'up', '-d', '--no-deps', '--force-recreate', 'backend') -failureMessage 'Failed to recreate backend for HBX local engines.'
}

Write-Host "HBX local engines ready. Count=$resolvedCount"
