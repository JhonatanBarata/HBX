param(
    [switch]$SkipDoctor
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Launcher = Join-Path $Root 'hbx_owner_launcher.py'
$StartScript = Join-Path $Root 'start-hbx.ps1'
$Startup = [Environment]::GetFolderPath('Startup')
$ShortcutPath = Join-Path $Startup 'HBX Owner.lnk'

function Resolve-PythonCommand {
    param([switch]$Windowless)

    $names = if ($Windowless) { @('pythonw.exe', 'pyw.exe') } else { @('python.exe', 'py.exe') }
    foreach ($name in $names) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Source }
    }
    throw 'Python não encontrado no PATH. Instale Python 3 ou ajuste o atalho manualmente.'
}

function Remove-HbxStartupShortcuts {
    $shell = New-Object -ComObject WScript.Shell
    Get-ChildItem $Startup -Filter '*.lnk' -ErrorAction SilentlyContinue | ForEach-Object {
        $shortcut = $shell.CreateShortcut($_.FullName)
        $joined = (($shortcut.TargetPath + ' ' + $shortcut.Arguments + ' ' + $_.Name) -replace '\\', '/').ToLowerInvariant()
        $rootKey = ($Root -replace '\\', '/').ToLowerInvariant()
        if (
            $joined.Contains('hbx_owner_app.py') -or
            $joined.Contains('hbx_owner_launcher.py') -or
            $joined.Contains('hbx_master_app.py') -or
            $joined.Contains('hbx_master_launcher.py') -or
            $joined.Contains('hbx master') -or
            $joined.Contains('hbxmaster') -or
            $joined.Contains('hbx boss') -or
            $joined.Contains('hbxboss') -or
            $joined.Contains('hbx-boss') -or
            $joined.Contains('c:/hbx-boss') -or
            $joined.Contains($rootKey)
        ) {
            Remove-Item $_.FullName -Force
            Write-Host "Removido atalho antigo: $($_.Name)"
        }
    }
}

if (!(Test-Path $StartScript) -and !(Test-Path $Launcher)) {
    throw "Launcher não encontrado: $Launcher"
}

if (!$SkipDoctor -and (Test-Path $Launcher)) {
    $python = Resolve-PythonCommand
    Write-Host 'Rodando doctor do HBX Owner...'
    & $python $Launcher --doctor --fix
}

Write-Host 'Limpando atalhos duplicados do Startup...'
Remove-HbxStartupShortcuts

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($ShortcutPath)
$powershellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shortcut.TargetPath = $powershellExe
$shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $StartScript + '"'
$shortcut.IconLocation = "$powershellExe,0"
$shortcut.Description = 'HBX Owner Local Pro - launcher seguro atualizado'
$shortcut.WorkingDirectory = $Root
$shortcut.WindowStyle = 3
$shortcut.Save()

Write-Host "Atalho único criado: $ShortcutPath"
Write-Host 'Na próxima inicialização, use apenas esse atalho. Não deixe outros atalhos chamando hbx_owner_app.py direto.'

