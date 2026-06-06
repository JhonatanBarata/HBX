param(
    [switch]$Fix,
    [switch]$KillDuplicates
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Launcher = Join-Path $Root 'hbx_owner_launcher.py'

function Resolve-PythonCommand {
    foreach ($name in @('python.exe', 'py.exe')) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Source }
    }
    throw 'Python não encontrado no PATH.'
}

$python = Resolve-PythonCommand

Write-Host 'Processos HBX Owner encontrados:'
$procs = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and ($_.CommandLine -match 'hbx_owner_(app|launcher)\.py|HBX Owner\.exe')
} | Sort-Object CreationDate

if (!$procs) {
    Write-Host '- nenhum processo encontrado'
} else {
    $procs | ForEach-Object {
        Write-Host ("- PID {0} | {1}" -f $_.ProcessId, $_.CommandLine)
    }
}

if ($KillDuplicates -and $procs.Count -gt 1) {
    $keep = $procs | Select-Object -First 1
    $toKill = $procs | Where-Object { $_.ProcessId -ne $keep.ProcessId }
    foreach ($proc in $toKill) {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host "Encerrado duplicado: PID $($proc.ProcessId)"
    }
}

Write-Host ''
if ($Fix) {
    & $python $Launcher --doctor --fix
} else {
    & $python $Launcher --doctor
}

