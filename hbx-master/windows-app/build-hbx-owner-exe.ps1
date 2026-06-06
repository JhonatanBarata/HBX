param(
    [switch]$NoClean
)

$ErrorActionPreference = "Stop"
$BaseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppScript = Join-Path $BaseDir "hbx_owner_app.py"
$IconPath = Join-Path $BaseDir "assets\hbx-owner.ico"
$BuildPath = Join-Path $BaseDir "build"
$ExePath = Join-Path $BaseDir "HBX Owner.exe"

if (!(Test-Path $AppScript)) {
    throw "App principal não encontrado: $AppScript"
}

if (!(Test-Path $IconPath)) {
    throw "Ícone não encontrado: $IconPath"
}

$cleanArgs = @()
if (-not $NoClean) {
    $cleanArgs += "--clean"
}

python -m PyInstaller `
    --noconfirm `
    @cleanArgs `
    --onefile `
    --windowed `
    --name "HBX Owner" `
    --icon "$IconPath" `
    --distpath "$BaseDir" `
    --workpath "$BuildPath" `
    --specpath "$BuildPath" `
    "$AppScript"

if (!(Test-Path $ExePath)) {
    throw "Build terminou sem gerar o executável: $ExePath"
}

Write-Host "Executável gerado: $ExePath"

