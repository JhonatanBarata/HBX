[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9][a-z0-9-]*$')]
  [string]$Scene,

  [ValidateSet('commercial', 'tutorial-admin', 'tutorial-entregador')]
  [string]$Target = 'tutorial-entregador',

  [ValidateRange(5, 180)]
  [int]$Seconds = 30,

  [ValidateRange(1000000, 100000000)]
  [int]$BitRate = 16000000,

  [switch]$OpenFolder
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name não foi encontrado no PATH. Instale o Android Platform Tools e abra um terminal novo."
  }
}

Assert-Command 'adb'

$devices = @(& adb devices | Select-Object -Skip 1 | ForEach-Object {
  $line = $_.Trim()
  if ($line -match '^([^\s]+)\s+device$') { $Matches[1] }
} | Where-Object { $_ })

if ($devices.Count -ne 1) {
  & adb devices
  throw "Era esperado exatamente 1 aparelho autorizado; encontrados: $($devices.Count). Aceite a chave RSA no Android."
}

$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$outDir = Join-Path $PSScriptRoot "native\$Target"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$final = Join-Path $outDir "$Scene.mp4"
if (Test-Path $final) {
  $backup = Join-Path $outDir ("{0}-{1}.bak.mp4" -f $Scene, (Get-Date -Format 'yyyyMMdd-HHmmss'))
  Move-Item $final $backup
  Write-Host "Cena anterior preservada em $backup" -ForegroundColor DarkGray
}

$remote = "/sdcard/Download/hbx-video-$Target-$Scene.mp4"
Write-Host ''
Write-Host "HBX Video Studio — tomada Android nativa" -ForegroundColor Cyan
Write-Host "Aparelho: $($devices[0])"
Write-Host "Destino:  $final"
Write-Host "Duração:  $Seconds segundos"
Write-Host ''
Write-Host 'Antes de continuar:' -ForegroundColor Yellow
Write-Host '  1. Use somente a empresa e os clientes fictícios.'
Write-Host '  2. Ative Não Perturbe e feche notificações pessoais.'
Write-Host '  3. Deixe o HBX na tela exata onde a tomada começa.'
Write-Host ''
Read-Host 'Pressione ENTER para iniciar a gravação' | Out-Null

& adb shell rm -f $remote | Out-Null
& adb shell screenrecord --bit-rate $BitRate --time-limit $Seconds $remote
if ($LASTEXITCODE -ne 0) { throw "screenrecord falhou com código $LASTEXITCODE." }

& adb pull $remote $final
if ($LASTEXITCODE -ne 0) { throw "adb pull falhou com código $LASTEXITCODE." }
& adb shell rm -f $remote | Out-Null

Write-Host ''
Write-Host "Cena capturada: $final" -ForegroundColor Green
Write-Host "Ao rodar npm run video:render, esta tomada substitui automaticamente a cena '$Scene' de '$Target'."

if ($OpenFolder) { Start-Process explorer.exe -ArgumentList "/select,`"$final`"" }
