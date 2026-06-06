param(
    [switch]$NoStartup,
    [switch]$NoDesktop
)

$BaseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ExePath = Join-Path $BaseDir "HBX Owner.exe"
$StartScript = Join-Path $BaseDir "start-hbx.ps1"
$StartWorkScript = Join-Path $BaseDir "start-work.ps1"
$FinishScript = Join-Path $BaseDir "finish-day.ps1"
$StartupInstaller = Join-Path $BaseDir "scripts\install-startup.ps1"
$PowerShellExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"

Add-Type -AssemblyName PresentationFramework

function New-HBXShortcut {
    param(
        [string]$Path,
        [string]$ScriptPath,
        [string]$Description
    )

    $parent = Split-Path -Parent $Path
    if (!(Test-Path $parent)) {
        New-Item -ItemType Directory -Path $parent | Out-Null
    }

    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($Path)
    $shortcut.TargetPath = $PowerShellExe
    $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""
    $shortcut.WorkingDirectory = $BaseDir
    $shortcut.Description = $Description
    $shortcut.IconLocation = "$PowerShellExe,0"
    $shortcut.Save()
}

function New-HBXExeShortcut {
    param(
        [string]$Path,
        [string]$Description
    )

    $parent = Split-Path -Parent $Path
    if (!(Test-Path $parent)) {
        New-Item -ItemType Directory -Path $parent | Out-Null
    }

    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($Path)
    $shortcut.TargetPath = $ExePath
    $shortcut.Arguments = ""
    $shortcut.WorkingDirectory = $BaseDir
    $shortcut.Description = $Description
    $shortcut.IconLocation = "$ExePath,0"
    $shortcut.WindowStyle = 3
    $shortcut.Save()
}

if (!(Test-Path $StartScript)) {
    [System.Windows.MessageBox]::Show(
        "Nao encontrei $StartScript. Rode este instalador a partir de C:\Users\Jhonatan\Desktop\App\hbx-owner\windows-app.",
        "HBX Owner",
        "OK",
        "Error"
    )
    exit 1
}

$desktop = [Environment]::GetFolderPath("DesktopDirectory")
$programs = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$startup = Join-Path $programs "Startup"

foreach ($oldShortcut in @(
    (Join-Path $desktop "HBX Master.lnk"),
    (Join-Path $programs "HBX Master.lnk"),
    (Join-Path $startup "HBX Master.lnk"),
    (Join-Path $desktop "HBX Boss.lnk"),
    (Join-Path $programs "HBX Boss.lnk"),
    (Join-Path $startup "HBX Boss.lnk")
)) {
    if (Test-Path $oldShortcut) {
        Remove-Item -LiteralPath $oldShortcut -Force
    }
}

if (-not $NoDesktop) {
    if (Test-Path $ExePath) {
        New-HBXExeShortcut -Path (Join-Path $desktop "HBX Owner.lnk") -Description "Abrir HBX Owner local"
    } else {
        New-HBXShortcut -Path (Join-Path $desktop "HBX Owner.lnk") -ScriptPath $StartScript -Description "Abrir HBX Owner local"
    }
    New-HBXShortcut -Path (Join-Path $desktop "HBX Start Work.lnk") -ScriptPath $StartWorkScript -Description "Iniciar expediente HBX"
    New-HBXShortcut -Path (Join-Path $desktop "HBX Fechar Dia.lnk") -ScriptPath $FinishScript -Description "Fechar expediente HBX"
}

if (Test-Path $ExePath) {
    New-HBXExeShortcut -Path (Join-Path $programs "HBX Owner.lnk") -Description "Abrir HBX Owner local"
} else {
    New-HBXShortcut -Path (Join-Path $programs "HBX Owner.lnk") -ScriptPath $StartScript -Description "Abrir HBX Owner local"
}

if (-not $NoStartup) {
    if (Test-Path $StartupInstaller) {
        & $PowerShellExe -NoProfile -ExecutionPolicy Bypass -File $StartupInstaller
    } else {
        New-HBXShortcut -Path (Join-Path $startup "HBX Owner.lnk") -ScriptPath $StartScript -Description "Abrir HBX Owner no login"
    }
}

[System.Windows.MessageBox]::Show(
    "HBX Owner instalado. Atalhos criados no Windows.",
    "HBX Owner",
    "OK",
    "Information"
)


