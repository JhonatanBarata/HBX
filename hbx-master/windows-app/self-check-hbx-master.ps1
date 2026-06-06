$ErrorActionPreference = "Stop"

$BaseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $BaseDir "logs"
if (!(Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
}

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogFile = Join-Path $LogDir "self-check-$Stamp.txt"
$Failures = 0

function Write-Check {
    param([string]$Text)
    $Text | Tee-Object -FilePath $LogFile -Append
}

function Add-Failure {
    param([string]$Text)
    $script:Failures += 1
    Write-Check "[FALHA] $Text"
}

function Invoke-LoggedCommand {
    param(
        [string]$Title,
        [string]$Command,
        [string[]]$Arguments
    )

    Write-Check ""
    Write-Check $Title
    try {
        & $Command @Arguments 2>&1 | Tee-Object -FilePath $LogFile -Append
        if ($LASTEXITCODE -ne 0) {
            Add-Failure "$Title saiu com codigo $LASTEXITCODE"
        }
    } catch {
        Add-Failure "$Title falhou: $($_.Exception.Message)"
    }
}

Set-Location $BaseDir

Write-Check "SELF-CHECK HBX MASTER"
Write-Check "Data: $(Get-Date -Format s)"
Write-Check "BaseDir: $BaseDir"
Write-Check ""

$RequiredFiles = @(
    "hbx_master_app.py",
    "hbx_master_launcher.py",
    "config.example.json",
    "launch-hbx-master.ps1",
    "start-hbx.ps1",
    "start-work.ps1",
    "finish-day.ps1",
    "save-tomorrow.ps1",
    "hbx-alert.ps1",
    "install-hbx-master.ps1",
    "uninstall-hbx-master.ps1",
    "scripts\install-startup.ps1",
    "scripts\hbx-master-doctor.ps1"
)

Write-Check "Arquivos obrigatorios:"
foreach ($File in $RequiredFiles) {
    $Path = Join-Path $BaseDir $File
    if (Test-Path $Path) {
        Write-Check "[OK] $File"
    } else {
        Add-Failure "$File ausente"
    }
}

$Python = (Get-Command python -ErrorAction SilentlyContinue)
if ($null -eq $Python) {
    Add-Failure "python nao encontrado no PATH"
} else {
    Write-Check ""
    Write-Check "[OK] Python: $($Python.Source)"
    Invoke-LoggedCommand "Python compile:" "python" @("-m", "py_compile", "hbx_master_app.py", "hbx_master_launcher.py")
    Invoke-LoggedCommand "SQLite init:" "python" @("hbx_master_launcher.py", "--init-db")
}

Write-Check ""
Write-Check "PowerShell parse:"
$PowerShellFiles = @(
    "self-check-hbx-master.ps1",
    "install-hbx-master.ps1",
    "uninstall-hbx-master.ps1",
    "launch-hbx-master.ps1",
    "start-hbx.ps1",
    "start-work.ps1",
    "finish-day.ps1",
    "save-tomorrow.ps1",
    "hbx-alert.ps1",
    "scripts\install-startup.ps1",
    "scripts\hbx-master-doctor.ps1"
)

foreach ($File in $PowerShellFiles) {
    $Path = Join-Path $BaseDir $File
    if (!(Test-Path $Path)) {
        Add-Failure "$File ausente para parse"
        continue
    }
    try {
        [scriptblock]::Create((Get-Content -Path $Path -Raw -Encoding UTF8)) | Out-Null
        Write-Check "[OK] $File"
    } catch {
        Add-Failure "$File parse falhou: $($_.Exception.Message)"
    }
}

Write-Check ""
if ($Failures -eq 0) {
    Write-Check "RESULTADO: OK"
    Write-Check "Log: $LogFile"
    exit 0
}

Write-Check "RESULTADO: FALHAS=$Failures"
Write-Check "Log: $LogFile"
exit 1

