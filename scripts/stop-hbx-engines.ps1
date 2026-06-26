# stop-hbx-engines.ps1
# Stops ALL local HBX engine containers (hbx-engine-*). App, database and fallback scraping engine
# stay untouched. Descobre os motores pelo nome do container vivo — NÃO depende de contagem/env, então
# "Desligar motores" derruba a frota inteira (1..N), não só os 3 primeiros (bug do default Count=3).

param(
	[int]$Count = 0  # mantido por compatibilidade; ignorado — paramos TODOS os hbx-engine-* vivos
)

$ErrorActionPreference = 'Stop'

# Lista todo container de motor vivo por prefixo de nome (independe de quantos a frota tem).
$names = & docker ps --filter 'name=hbx-engine-' --format '{{.Names}}'
if ($LASTEXITCODE -ne 0) {
	throw "Failed to list HBX local engines. Exit code: $LASTEXITCODE."
}
$engines = @($names | Where-Object { $_ -and ($_ -match 'hbx-engine-') })

if ($engines.Count -eq 0) {
	Write-Host "No HBX local engines running."
	exit 0
}

Write-Host "Stopping ALL HBX local engines ($($engines.Count)): $($engines -join ', ')"
& docker stop @engines | Out-Null
if ($LASTEXITCODE -ne 0) {
	throw "Failed to stop HBX local engines. Exit code: $LASTEXITCODE."
}
Write-Host "HBX local engines stopped: $($engines.Count)."
