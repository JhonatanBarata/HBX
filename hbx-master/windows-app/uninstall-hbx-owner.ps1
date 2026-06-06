$desktop = [Environment]::GetFolderPath("DesktopDirectory")
$programs = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$startup = Join-Path $programs "Startup"

Add-Type -AssemblyName PresentationFramework

$shortcuts = @(
    (Join-Path $desktop "HBX Owner.lnk"),
    (Join-Path $desktop "HBX Master.lnk"),
    (Join-Path $desktop "HBX Start Work.lnk"),
    (Join-Path $desktop "HBX Fechar Dia.lnk"),
    (Join-Path $programs "HBX Owner.lnk"),
    (Join-Path $programs "HBX Master.lnk"),
    (Join-Path $startup "HBX Owner.lnk"),
    (Join-Path $startup "HBX Master.lnk")
)

$removed = 0
foreach ($shortcut in $shortcuts) {
    if (Test-Path $shortcut) {
        Remove-Item -LiteralPath $shortcut -Force
        $removed += 1
    }
}

[System.Windows.MessageBox]::Show(
    "Atalhos removidos: $removed. Arquivos e banco local do HBX Owner foram preservados.",
    "HBX Owner",
    "OK",
    "Information"
)

